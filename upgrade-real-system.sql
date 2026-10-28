-- Attendly production-style feature upgrade.
-- Run this AFTER schema.sql in Supabase SQL Editor.
-- Adds leave requests, attendance correction workflow, and an audit trail.

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  attachment_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewer_note text not null default '' check (char_length(reviewer_note) <= 1000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists leave_requests_student_idx on public.leave_requests(student_id, created_at desc);
create index if not exists leave_requests_status_idx on public.leave_requests(status, created_at desc);

create table if not exists public.attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null references public.attendance_records(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  requested_status public.attendance_status not null,
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewer_note text not null default '' check (char_length(reviewer_note) <= 1000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists attendance_correction_status_idx on public.attendance_correction_requests(status, created_at desc);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id, created_at desc);

alter table public.leave_requests enable row level security;
alter table public.attendance_correction_requests enable row level security;
alter table public.audit_logs enable row level security;

grant select, insert, update on public.leave_requests to authenticated;
grant select, insert, update on public.attendance_correction_requests to authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists leave_select_relevant on public.leave_requests;
create policy leave_select_relevant on public.leave_requests for select to authenticated
using (
  private.is_admin()
  or student_id=(select auth.uid())
  or exists (
    select 1 from public.class_subjects cs
    where cs.class_id=leave_requests.class_id and cs.teacher_id=(select auth.uid())
  )
);
drop policy if exists leave_insert_self on public.leave_requests;
create policy leave_insert_self on public.leave_requests for insert to authenticated
with check (
  student_id=(select auth.uid())
  and exists(select 1 from public.enrollments e where e.student_id=(select auth.uid()) and e.class_id=leave_requests.class_id)
  and status='pending'
  and reviewed_by is null
  and reviewed_at is null
);
drop policy if exists leave_review_staff on public.leave_requests;
create policy leave_review_staff on public.leave_requests for update to authenticated
using (
  private.is_admin()
  or exists(select 1 from public.class_subjects cs where cs.class_id=leave_requests.class_id and cs.teacher_id=(select auth.uid()))
)
with check (
  (private.is_admin() or exists(select 1 from public.class_subjects cs where cs.class_id=leave_requests.class_id and cs.teacher_id=(select auth.uid())))
  and status in ('pending','approved','rejected')
  and (status='pending' or (reviewed_by=(select auth.uid()) and reviewed_at is not null))
);

drop policy if exists correction_select_relevant on public.attendance_correction_requests;
create policy correction_select_relevant on public.attendance_correction_requests for select to authenticated
using (
  private.is_admin()
  or requested_by=(select auth.uid())
  or exists(select 1 from public.attendance_records ar join public.class_subjects cs on cs.id=ar.class_subject_id where ar.id=attendance_record_id and cs.teacher_id=(select auth.uid()))
);
drop policy if exists correction_insert_self on public.attendance_correction_requests;
create policy correction_insert_self on public.attendance_correction_requests for insert to authenticated
with check (
  requested_by=(select auth.uid())
  and status='pending'
  and reviewed_by is null
  and reviewed_at is null
  and exists(select 1 from public.attendance_records ar where ar.id=attendance_record_id and ar.student_id=(select auth.uid()))
);
drop policy if exists correction_review_staff on public.attendance_correction_requests;
create policy correction_review_staff on public.attendance_correction_requests for update to authenticated
using (
  private.is_admin()
  or exists(select 1 from public.attendance_records ar join public.class_subjects cs on cs.id=ar.class_subject_id where ar.id=attendance_record_id and cs.teacher_id=(select auth.uid()))
)
with check (
  (private.is_admin() or exists(select 1 from public.attendance_records ar join public.class_subjects cs on cs.id=ar.class_subject_id where ar.id=attendance_record_id and cs.teacher_id=(select auth.uid())))
  and status in ('pending','approved','rejected')
  and (status='pending' or (reviewed_by=(select auth.uid()) and reviewed_at is not null))
);

drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs for select to authenticated using(private.is_admin());

-- Audit attendance edits automatically. This trigger records the actor and before/after state.
create or replace function private.audit_attendance_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_action text;
  v_old jsonb;
  v_new jsonb;
  v_id text;
begin
  if tg_op='INSERT' then
    v_action := 'attendance.insert';
    v_old := null;
    v_new := to_jsonb(new);
    v_id := new.id::text;
  elsif tg_op='UPDATE' then
    v_action := 'attendance.update';
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_id := new.id::text;
  else
    v_action := 'attendance.delete';
    v_old := to_jsonb(old);
    v_new := null;
    v_id := old.id::text;
  end if;
  insert into public.audit_logs(actor_id,action,table_name,record_id,old_data,new_data)
  values(v_actor,v_action,'attendance_records',v_id,v_old,v_new);
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.audit_attendance_change() from public, anon, authenticated;
drop trigger if exists attendance_audit_trigger on public.attendance_records;
create trigger attendance_audit_trigger
after insert or update or delete on public.attendance_records
for each row execute function private.audit_attendance_change();

-- Do not expose audit_logs writes directly to browser clients; only the trigger writes audit events.
