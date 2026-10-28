# Attendly College ERP System — Clean Copy

Same Attendly frontend, configured for a fresh Supabase project.

- Supabase project ref: `zizhlvnqipytczkmmtxr`
- No old student, teacher, attendance, or personal records copied.
- SMS OTP verification removed from the student profile-change flow.
- Original repository and database remain unchanged.

## Setup
1. Open https://supabase.com/dashboard/project/zizhlvnqipytczkmmtxr
2. Run `schema.sql` in the new project's SQL Editor.
3. Configure required Edge Functions and storage buckets in the new project before testing those workflows.
4. Deploy as a static site and test with newly created test accounts.

Never put a service-role key in browser code. Enforce database access with RLS.
