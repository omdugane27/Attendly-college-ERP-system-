-- Attendly compatibility migration: missing panel tables.
-- Non-destructive; safe to apply to the existing Attendly Supabase project.
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null constraint complaints_sender_id_fkey references public.profiles(id) on delete cascade,
  subject text not null check (char_length(trim(subject)) between 3 and 200),
  category text not null default 'general',
  description text not null check (char_length(trim(description)) between 5 and 5000),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','rejected')),
  admin_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists complaints_sender_created_idx on public.complaints(sender_id, created_at desc);
create index if not exists complaints_status_created_idx on public.complaints(status, created_at desc);
alter table public.complaints enable row level security;
grant select, insert, update on public.complaints to authenticated;
drop policy if exists complaints_read_own_or_admin on public.complaints;
create policy complaints_read_own_or_admin on public.complaints
 for select to authenticated using (
   sender_id = (select auth.uid())
   or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
 );
drop policy if exists complaints_insert_non_admin_own on public.complaints;
create policy complaints_insert_non_admin_own on public.complaints
 for insert to authenticated with check (
   sender_id = (select auth.uid())
   and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role <> 'admin')
 );
drop policy if exists complaints_update_admin_only on public.complaints;
create policy complaints_update_admin_only on public.complaints
 for update to authenticated using (
   exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
 ) with check (
   exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
 );

create table if not exists public.certificate_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null constraint certificate_requests_student_id_fkey references public.profiles(id) on delete cascade,
  certificate_type text not null,
  purpose text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  hod_approved boolean not null default false,
  admin_approved boolean not null default false,
  pdf_status text not null default 'pending' check (pdf_status in ('pending','generating','ready','failed')),
  pdf_path text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists certificate_requests_student_created_idx on public.certificate_requests(student_id, created_at desc);
create index if not exists certificate_requests_status_created_idx on public.certificate_requests(status, created_at desc);
alter table public.certificate_requests enable row level security;
grant select, insert, update on public.certificate_requests to authenticated;
drop policy if exists certificate_requests_read_owner_or_reviewers on public.certificate_requests;
create policy certificate_requests_read_owner_or_reviewers on public.certificate_requests
 for select to authenticated using (
   student_id = (select auth.uid())
   or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (p.role='admin' or p.institutional_role='hod'))
 );
drop policy if exists certificate_requests_insert_own_student on public.certificate_requests;
create policy certificate_requests_insert_own_student on public.certificate_requests
 for insert to authenticated with check (
   student_id = (select auth.uid())
   and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='student')
 );
drop policy if exists certificate_requests_review_admin_hod on public.certificate_requests;
create policy certificate_requests_review_admin_hod on public.certificate_requests
 for update to authenticated using (
   exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (p.role='admin' or p.institutional_role='hod'))
 ) with check (
   exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (p.role='admin' or p.institutional_role='hod'))
 );
notify pgrst, 'reload schema';
