-- Attendly database schema. Intended for a new Supabase project.
-- Apply via Supabase SQL Editor (or migration tooling). Do not run against an unrelated existing database.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

do $$ begin create type public.app_role as enum ('admin','teacher','student');
exception when duplicate_object then null; end $$;
do $$ begin create type public.attendance_status as enum ('present','absent','late','leave');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role public.app_role not null default 'student',
  student_number text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.classes(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  section text not null default '',
  academic_year text not null default extract(year from now())::text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(name,section,academic_year)
);
create table if not exists public.subjects(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.class_subjects(
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(class_id,subject_id)
);
create table if not exists public.enrollments(
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique(class_id,student_id)
);
create table if not exists public.attendance_records(
  id uuid primary key default gen_random_uuid(),
  class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  attendance_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  status public.attendance_status not null,
  marked_by uuid not null references public.profiles(id),
  notes text not null default '' check(char_length(notes)<=500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(class_subject_id,student_id,attendance_date)
);

create index if not exists enrollments_student_idx on public.enrollments(student_id);
create index if not exists enrollments_class_idx on public.enrollments(class_id);
create index if not exists class_subjects_teacher_idx on public.class_subjects(teacher_id);
create index if not exists class_subjects_subject_idx on public.class_subjects(subject_id);
create index if not exists classes_created_by_idx on public.classes(created_by);
create index if not exists attendance_date_idx on public.attendance_records(attendance_date);
create index if not exists attendance_student_idx on public.attendance_records(student_id);
create index if not exists attendance_marked_by_idx on public.attendance_records(marked_by);
create index if not exists attendance_class_subject_date_idx on public.attendance_records(class_subject_id,attendance_date);

create or replace function private.current_role()
returns public.app_role language sql stable security definer set search_path=''
as $$ select p.role from public.profiles p where p.id=(select auth.uid()) $$;
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path=''
as $$ select coalesce(private.current_role()='admin'::public.app_role,false) $$;
create or replace function private.is_teacher()
returns boolean language sql stable security definer set search_path=''
as $$ select coalesce(private.current_role()='teacher'::public.app_role,false) $$;
create or replace function private.teaches_class_subject(p_class_subject_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.class_subjects cs where cs.id=p_class_subject_id and cs.teacher_id=(select auth.uid())) $$;
create or replace function private.enrolled_in_class_subject(p_class_subject_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.class_subjects cs join public.enrollments e on e.class_id=cs.class_id where cs.id=p_class_subject_id and e.student_id=(select auth.uid())) $$;
revoke all on all functions in schema private from public,anon;
grant execute on all functions in schema private to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.profiles(id,full_name,email,role)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),coalesce(new.email,''),'student')
 on conflict(id) do nothing;
 return new;
end $$;
revoke all on function public.handle_new_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path=''
as $$ begin new.updated_at=now();return new;end $$;
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
drop trigger if exists attendance_updated_at on public.attendance_records;
create trigger attendance_updated_at before update on public.attendance_records for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.subjects enable row level security;
alter table public.class_subjects enable row level security;
alter table public.enrollments enable row level security;
alter table public.attendance_records enable row level security;
grant select,insert,update,delete on public.profiles,public.classes,public.subjects,public.class_subjects,public.enrollments,public.attendance_records to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using(id=(select auth.uid()) or private.is_admin() or (private.is_teacher() and exists(select 1 from public.enrollments e join public.class_subjects cs on cs.class_id=e.class_id where e.student_id=profiles.id and cs.teacher_id=(select auth.uid()))));
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
with check(id=(select auth.uid()) and role='student'::public.app_role);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
using(id=(select auth.uid())) with check(id=(select auth.uid()) and role=(select private.current_role()));
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all to authenticated using(private.is_admin()) with check(private.is_admin());

drop policy if exists classes_select_relevant on public.classes;
create policy classes_select_relevant on public.classes for select to authenticated using(
private.is_admin()
or exists(select 1 from public.class_subjects cs where cs.class_id=classes.id and cs.teacher_id=(select auth.uid()))
or exists(select 1 from public.enrollments e where e.class_id=classes.id and e.student_id=(select auth.uid())));
drop policy if exists classes_admin_all on public.classes;
create policy classes_admin_all on public.classes for all to authenticated using(private.is_admin()) with check(private.is_admin());

drop policy if exists subjects_select_auth on public.subjects;
create policy subjects_select_auth on public.subjects for select to authenticated using(true);
drop policy if exists subjects_admin_all on public.subjects;
create policy subjects_admin_all on public.subjects for all to authenticated using(private.is_admin()) with check(private.is_admin());

drop policy if exists cs_select_relevant on public.class_subjects;
create policy cs_select_relevant on public.class_subjects for select to authenticated using(private.is_admin() or teacher_id=(select auth.uid()) or private.enrolled_in_class_subject(id));
drop policy if exists cs_admin_all on public.class_subjects;
create policy cs_admin_all on public.class_subjects for all to authenticated using(private.is_admin()) with check(private.is_admin());

drop policy if exists enrollments_select_relevant on public.enrollments;
create policy enrollments_select_relevant on public.enrollments for select to authenticated using(private.is_admin() or student_id=(select auth.uid()) or exists(select 1 from public.class_subjects cs where cs.class_id=enrollments.class_id and cs.teacher_id=(select auth.uid())));
drop policy if exists enrollments_admin_all on public.enrollments;
create policy enrollments_admin_all on public.enrollments for all to authenticated using(private.is_admin()) with check(private.is_admin());

drop policy if exists attendance_select_relevant on public.attendance_records;
create policy attendance_select_relevant on public.attendance_records for select to authenticated using(private.is_admin() or student_id=(select auth.uid()) or private.teaches_class_subject(class_subject_id));
drop policy if exists attendance_insert_teacher on public.attendance_records;
create policy attendance_insert_teacher on public.attendance_records for insert to authenticated with check(
private.is_admin() or (private.teaches_class_subject(class_subject_id) and marked_by=(select auth.uid()) and exists(select 1 from public.class_subjects cs join public.enrollments e on e.class_id=cs.class_id where cs.id=class_subject_id and e.student_id=attendance_records.student_id)));
drop policy if exists attendance_update_teacher on public.attendance_records;
create policy attendance_update_teacher on public.attendance_records for update to authenticated using(private.is_admin() or private.teaches_class_subject(class_subject_id)) with check(private.is_admin() or (private.teaches_class_subject(class_subject_id) and marked_by=(select auth.uid()) and exists(select 1 from public.class_subjects cs join public.enrollments e on e.class_id=cs.class_id where cs.id=class_subject_id and e.student_id=attendance_records.student_id)));
drop policy if exists attendance_delete_admin on public.attendance_records;
create policy attendance_delete_admin on public.attendance_records for delete to authenticated using(private.is_admin());

create or replace view public.attendance_summary with (security_invoker=true) as
select student_id,class_subject_id,count(*)::integer total_sessions,
 count(*) filter(where status='present')::integer present_count,
 count(*) filter(where status='late')::integer late_count,
 count(*) filter(where status='absent')::integer absent_count,
 count(*) filter(where status='leave')::integer leave_count,
 round(100.0*count(*) filter(where status in ('present','late'))/nullif(count(*),0),1) attendance_percentage
from public.attendance_records group by student_id,class_subject_id;
grant select on public.attendance_summary to authenticated;
