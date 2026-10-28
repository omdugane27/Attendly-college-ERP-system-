-- Attendly campus-grade feature pack.
-- Apply AFTER schema.sql and upgrade-real-system.sql in Supabase SQL Editor.
-- Adds timetable, institution announcements and in-app notifications.
-- UI screens must be added separately before these features are visible in the app.

create table if not exists public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: Monday=1
  start_time time not null,
  end_time time not null,
  room text not null default '' check (char_length(room) <= 100),
  effective_from date,
  effective_to date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);
create index if not exists timetable_weekday_idx on public.timetable_entries(weekday,start_time);
create index if not exists timetable_class_subject_idx on public.timetable_entries(class_subject_id);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 160),
  body text not null check (char_length(trim(body)) between 3 and 10000),
  audience text not null default 'all' check (audience in ('all','students','teachers','class')),
  class_id uuid references public.classes(id) on delete cascade,
  published boolean not null default false,
  published_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((audience='class' and class_id is not null) or (audience<>'class' and class_id is null))
);
create index if not exists announcements_published_idx on public.announcements(published,published_at desc);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  body text not null default '' check (char_length(body) <= 2000),
  category text not null default 'general' check (category in ('general','attendance','leave','announcement','system')),
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_unread_idx on public.user_notifications(user_id,read_at,created_at desc);

alter table public.timetable_entries enable row level security;
alter table public.announcements enable row level security;
alter table public.user_notifications enable row level security;

grant select,insert,update,delete on public.timetable_entries to authenticated;
grant select,insert,update,delete on public.announcements to authenticated;
grant select,update on public.user_notifications to authenticated;
grant insert on public.user_notifications to authenticated;

drop policy if exists timetable_select_relevant on public.timetable_entries;
create policy timetable_select_relevant on public.timetable_entries for select to authenticated using (
 private.is_admin()
 or exists(select 1 from public.class_subjects cs where cs.id=class_subject_id and cs.teacher_id=(select auth.uid()))
 or exists(select 1 from public.class_subjects cs join public.enrollments e on e.class_id=cs.class_id where cs.id=class_subject_id and e.student_id=(select auth.uid()))
);
drop policy if exists timetable_admin_manage on public.timetable_entries;
create policy timetable_admin_manage on public.timetable_entries for all to authenticated using(private.is_admin()) with check(private.is_admin());

drop policy if exists announcements_select_audience on public.announcements;
create policy announcements_select_audience on public.announcements for select to authenticated using (
 private.is_admin()
 or (published and (
   audience='all'
   or (audience='students' and private.current_role()='student'::public.app_role)
   or (audience='teachers' and private.current_role()='teacher'::public.app_role)
   or (audience='class' and exists(select 1 from public.enrollments e where e.class_id=announcements.class_id and e.student_id=(select auth.uid())))
 ))
);
drop policy if exists announcements_admin_manage on public.announcements;
create policy announcements_admin_manage on public.announcements for all to authenticated using(private.is_admin()) with check(private.is_admin());

drop policy if exists notifications_select_self on public.user_notifications;
create policy notifications_select_self on public.user_notifications for select to authenticated using(user_id=(select auth.uid()) or private.is_admin());
drop policy if exists notifications_update_self on public.user_notifications;
create policy notifications_update_self on public.user_notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists notifications_insert_admin on public.user_notifications;
create policy notifications_insert_admin on public.user_notifications for insert to authenticated with check(private.is_admin());

-- Trigger helpers create notifications only for affected students and trusted admin actions.
create or replace function private.notify_attendance_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_student uuid;
  v_status text;
  v_date date;
begin
  if tg_op='DELETE' then
    v_student := old.student_id; v_status := old.status::text; v_date := old.attendance_date;
  else
    v_student := new.student_id; v_status := new.status::text; v_date := new.attendance_date;
  end if;
  insert into public.user_notifications(user_id,title,body,category)
  values(v_student,'Attendance updated','Attendance for '||v_date::text||' is recorded as '||v_status||'.','attendance');
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.notify_attendance_change() from public,anon,authenticated;
drop trigger if exists attendance_notify_trigger on public.attendance_records;
create trigger attendance_notify_trigger after insert or update on public.attendance_records
for each row execute function private.notify_attendance_change();

create or replace function private.notify_published_announcement()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  p record;
begin
  if new.published and (tg_op='INSERT' or not old.published or old.title is distinct from new.title or old.body is distinct from new.body) then
    for p in
      select pr.id
      from public.profiles pr
      where
        new.audience='all'
        or (new.audience='students' and pr.role='student'::public.app_role)
        or (new.audience='teachers' and pr.role='teacher'::public.app_role)
        or (new.audience='class' and pr.role='student'::public.app_role and exists(select 1 from public.enrollments e where e.student_id=pr.id and e.class_id=new.class_id))
    loop
      insert into public.user_notifications(user_id,title,body,category)
      values(p.id,new.title,left(new.body,2000),'announcement');
    end loop;
  end if;
  return new;
end $$;
revoke all on function private.notify_published_announcement() from public,anon,authenticated;
drop trigger if exists announcement_notify_trigger on public.announcements;
create trigger announcement_notify_trigger after insert or update on public.announcements
for each row execute function private.notify_published_announcement();

