-- Attendly Enterprise ERP foundation (additive; run after schema.sql and earlier upgrade scripts)
create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists institutional_role text not null default 'student',
  add column if not exists department text,
  add column if not exists faculty_code text;

do $$ begin
 alter table public.profiles add constraint profiles_institutional_role_check
 check (institutional_role in ('student','lecturer','lab_assistant','mentor','hod','dean','registrar','system_admin','parent'));
exception when duplicate_object then null; end $$;

create table if not exists public.role_permissions(
 id uuid primary key default gen_random_uuid(),
 institutional_role text not null,
 permission_key text not null,
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 unique(institutional_role,permission_key)
);
alter table public.role_permissions enable row level security;
drop policy if exists role_permissions_admin_all on public.role_permissions;
create policy role_permissions_admin_all on public.role_permissions for all to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists role_permissions_read_signed_in on public.role_permissions;
create policy role_permissions_read_signed_in on public.role_permissions for select to authenticated using(true);
grant select,insert,update,delete on public.role_permissions to authenticated;
insert into public.role_permissions(institutional_role,permission_key) values
('lecturer','attendance.mark'),('lecturer','attendance.read_assigned'),('lecturer','condonation.review_tier1'),
('lab_assistant','attendance.mark_lab'),('lab_assistant','attendance.read_lab'),
('mentor','condonation.review_tier1'),('mentor','student.read_mentees'),
('hod','attendance.read_department'),('hod','condonation.review_tier2'),('hod','reports.department'),
('dean','condonation.review_tier3'),('dean','reports.faculty'),
('registrar','reports.institution'),('registrar','compliance.export'),
('system_admin','system.configure'),('system_admin','audit.read'),('system_admin','roles.manage')
on conflict(institutional_role,permission_key) do nothing;

create table if not exists public.governance_audit_events(
 id bigint generated always as identity primary key,
 table_name text not null,
 record_id text not null,
 operation text not null check(operation in ('INSERT','UPDATE','DELETE')),
 actor_id uuid,
 actor_role text,
 occurred_at timestamptz not null default now(),
 request_ip inet,
 request_user_agent text,
 old_values jsonb,
 new_values jsonb,
 request_id text
);
create index if not exists governance_audit_events_time_idx on public.governance_audit_events(occurred_at desc);
create index if not exists governance_audit_events_record_idx on public.governance_audit_events(table_name,record_id);
alter table public.governance_audit_events enable row level security;
drop policy if exists governance_audit_read_admin on public.governance_audit_events;
create policy governance_audit_read_admin on public.governance_audit_events for select to authenticated using(private.is_admin());
revoke insert,update,delete,truncate on public.governance_audit_events from anon,authenticated;
grant select on public.governance_audit_events to authenticated;

create or replace function private.capture_governance_audit()
returns trigger language plpgsql security definer set search_path=''
as $$
declare o jsonb; n jsonb; rid text; h jsonb; ip text; ua text; req text;
begin
 if TG_OP='INSERT' then o:=null;n:=to_jsonb(NEW);rid:=coalesce(n->>'id',n->>'student_id','unknown');
 elsif TG_OP='UPDATE' then o:=to_jsonb(OLD);n:=to_jsonb(NEW);rid:=coalesce(n->>'id',n->>'student_id','unknown');
 else o:=to_jsonb(OLD);n:=null;rid:=coalesce(o->>'id',o->>'student_id','unknown'); end if;
 begin
  h:=nullif(current_setting('request.headers',true),'')::jsonb;
  ip:=split_part(coalesce(h->>'x-forwarded-for',h->>'x-real-ip',''),',',1);
  ua:=h->>'user-agent';req:=h->>'x-request-id';
 exception when others then ip:=null;ua:=null;req:=null; end;
 insert into public.governance_audit_events(table_name,record_id,operation,actor_id,actor_role,request_ip,request_user_agent,old_values,new_values,request_id)
 values(TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME,rid,TG_OP,auth.uid(),coalesce(private.current_role()::text,'system'),nullif(trim(ip),'')::inet,ua,o,n,req);
 return coalesce(NEW,OLD);
end $$;
revoke all on function private.capture_governance_audit() from public,anon,authenticated;
drop trigger if exists governance_audit_attendance_records on public.attendance_records;
create trigger governance_audit_attendance_records after insert or update or delete on public.attendance_records for each row execute function private.capture_governance_audit();
drop trigger if exists governance_audit_enrollments on public.enrollments;
create trigger governance_audit_enrollments after insert or update or delete on public.enrollments for each row execute function private.capture_governance_audit();

create table if not exists public.timetable_exceptions(
 id uuid primary key default gen_random_uuid(),
 class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
 original_date date not null,
 exception_type text not null check(exception_type in ('rescheduled','cancelled','holiday','campus_event','room_change')),
 replacement_date date,
 replacement_start time,
 replacement_end time,
 room text,
 reason text not null,
 created_by uuid not null references public.profiles(id),
 approved_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(class_subject_id,original_date,exception_type)
);
alter table public.timetable_exceptions enable row level security;
drop policy if exists timetable_exceptions_read_related on public.timetable_exceptions;
create policy timetable_exceptions_read_related on public.timetable_exceptions for select to authenticated using(
 private.is_admin() or created_by=(select auth.uid()) or approved_by=(select auth.uid())
 or exists(select 1 from public.class_subjects cs where cs.id=class_subject_id and cs.teacher_id=(select auth.uid()))
 or exists(select 1 from public.enrollments e join public.class_subjects cs on cs.class_id=e.class_id where cs.id=class_subject_id and e.student_id=(select auth.uid()))
);
drop policy if exists timetable_exceptions_admin_manage on public.timetable_exceptions;
create policy timetable_exceptions_admin_manage on public.timetable_exceptions for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant select,insert,update,delete on public.timetable_exceptions to authenticated;

create table if not exists public.duty_leave_batches(
 id uuid primary key default gen_random_uuid(),
 title text not null,
 event_type text not null check(event_type in ('placement','sports','cultural','official_duty','other')),
 class_id uuid references public.classes(id) on delete set null,
 start_date date not null,
 end_date date not null,
 reason text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','applied')),
 student_ids uuid[] not null default '{}',
 created_by uuid not null references public.profiles(id),
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 check(end_date>=start_date)
);
alter table public.duty_leave_batches enable row level security;
drop policy if exists duty_leave_batches_read on public.duty_leave_batches;
create policy duty_leave_batches_read on public.duty_leave_batches for select to authenticated using(private.is_admin() or created_by=(select auth.uid()) or reviewed_by=(select auth.uid()));
drop policy if exists duty_leave_batches_admin_manage on public.duty_leave_batches;
create policy duty_leave_batches_admin_manage on public.duty_leave_batches for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant select,insert,update,delete on public.duty_leave_batches to authenticated;

create table if not exists public.attendance_anomaly_flags(
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.profiles(id) on delete cascade,
 attendance_record_ids uuid[] not null default '{}',
 anomaly_type text not null check(anomaly_type in ('overlapping_classes','duplicate_presence','biometric_mismatch','wifi_mismatch','manual_review')),
 severity text not null default 'medium' check(severity in ('low','medium','high','critical')),
 details jsonb not null default '{}',
 status text not null default 'open' check(status in ('open','investigating','resolved','false_positive')),
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.attendance_anomaly_flags enable row level security;
drop policy if exists attendance_anomaly_admin_all on public.attendance_anomaly_flags;
create policy attendance_anomaly_admin_all on public.attendance_anomaly_flags for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant select,insert,update,delete on public.attendance_anomaly_flags to authenticated;

create table if not exists public.attendance_alert_rules(
 id uuid primary key default gen_random_uuid(),
 name text not null,
 threshold_percentage numeric(5,2) not null check(threshold_percentage between 0 and 100),
 channel text not null check(channel in ('in_app','email','sms','push')),
 audience text not null check(audience in ('student','guardian','mentor','hod')),
 action_key text not null check(action_key in ('warning','parent_notice','review_required','exam_eligibility_review')),
 enabled boolean not null default true,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table public.attendance_alert_rules enable row level security;
drop policy if exists attendance_alert_rules_admin_all on public.attendance_alert_rules;
create policy attendance_alert_rules_admin_all on public.attendance_alert_rules for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant select,insert,update,delete on public.attendance_alert_rules to authenticated;

create table if not exists public.integration_event_log(
 id uuid primary key default gen_random_uuid(),
 provider text not null,
 external_event_id text not null,
 event_type text not null,
 payload_hash text not null,
 status text not null default 'received' check(status in ('received','processed','rejected','failed')),
 error_message text,
 received_at timestamptz not null default now(),
 processed_at timestamptz,
 unique(provider,external_event_id)
);
alter table public.integration_event_log enable row level security;
drop policy if exists integration_event_log_admin_read on public.integration_event_log;
create policy integration_event_log_admin_read on public.integration_event_log for select to authenticated using(private.is_admin());
revoke insert,update,delete on public.integration_event_log from anon,authenticated;
grant select on public.integration_event_log to authenticated;
