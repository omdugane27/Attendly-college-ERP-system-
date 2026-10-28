-- Student registration profile fields for existing Attendly deployments.
-- Run after schema.sql. The student fields are optional unless marked required in the signup form.
alter table public.profiles
  add column if not exists phone text,
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists department text,
  add column if not exists course_name text,
  add column if not exists semester integer,
  add column if not exists admission_year integer,
  add column if not exists address text,
  add column if not exists guardian_name text,
  add column if not exists guardian_phone text,
  add column if not exists emergency_contact text,
  add column if not exists blood_group text;

do $$ begin
  alter table public.profiles add constraint profiles_semester_range_check check (semester is null or semester between 1 and 12);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_gender_check check (gender is null or gender in ('female','male','non_binary','prefer_not_to_say'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_blood_group_check check (blood_group is null or blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown'));
exception when duplicate_object then null; end $$;

create index if not exists profiles_student_number_idx on public.profiles(student_number);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.profiles(
   id, full_name, email, role, student_number, phone, date_of_birth, gender, department,
   course_name, semester, admission_year, address, guardian_name, guardian_phone,
   emergency_contact, blood_group
 )
 values(
   new.id,
   coalesce(new.raw_user_meta_data->>'full_name',''),
   coalesce(new.email,''),
   'student',
   nullif(new.raw_user_meta_data->>'student_number',''),
   nullif(new.raw_user_meta_data->>'phone',''),
   nullif(new.raw_user_meta_data->>'date_of_birth','')::date,
   nullif(new.raw_user_meta_data->>'gender',''),
   nullif(new.raw_user_meta_data->>'department',''),
   nullif(new.raw_user_meta_data->>'course_name',''),
   nullif(new.raw_user_meta_data->>'semester','')::integer,
   nullif(new.raw_user_meta_data->>'admission_year','')::integer,
   nullif(new.raw_user_meta_data->>'address',''),
   nullif(new.raw_user_meta_data->>'guardian_name',''),
   nullif(new.raw_user_meta_data->>'guardian_phone',''),
   nullif(new.raw_user_meta_data->>'emergency_contact',''),
   nullif(new.raw_user_meta_data->>'blood_group','')
 )
 on conflict(id) do update set
   full_name=excluded.full_name,
   student_number=excluded.student_number,
   phone=excluded.phone,
   date_of_birth=excluded.date_of_birth,
   gender=excluded.gender,
   department=excluded.department,
   course_name=excluded.course_name,
   semester=excluded.semester,
   admission_year=excluded.admission_year,
   address=excluded.address,
   guardian_name=excluded.guardian_name,
   guardian_phone=excluded.guardian_phone,
   emergency_contact=excluded.emergency_contact,
   blood_group=excluded.blood_group;
 return new;
end $$;
