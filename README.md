# Attendly — Student Attendance Management System

A responsive, mobile-friendly student attendance app built with HTML/CSS/JavaScript and Supabase Auth + PostgreSQL. GitHub Pages is the intended static hosting target; Android Acode can be used for local editing.

## Main features
- Secure sign-up and email/password login with Supabase Auth
- Admin, Teacher and Student roles with database-enforced Row Level Security
- Admin management of classes, subjects, user roles, teacher assignments and enrolments
- Daily attendance register with Present, Absent, Late and Leave statuses
- Duplicate prevention by a database unique constraint
- Student attendance history and attendance percentages
- Date-filtered reports and CSV export for Excel
- Responsive dashboard charts, navigation and forms

## Files
- `index.html` — application shell
- `styles.css` — responsive professional UI
- `app.js` — Supabase integration and application logic
- `supabase/schema.sql` — schema, policies, helper functions and summary view
- `tests/smoke-check.js` — lightweight source integrity checks

## Configure Supabase
The app is currently configured for the dedicated project:
- Project URL: `https://zizhlvnqipytczkmmtxr.supabase.co`
- Publishable key: `sb_publishable_nhpDbc5sFfncXO-XETpIzw_7RpcNpuk`

The publishable key is intended for browser use. Never add a `service_role` or secret API key to client code.

The current Supabase project has the schema already applied. For another new Supabase project, open SQL Editor and run all of `supabase/schema.sql`.

### Create the first administrator
1. Sign up through the web app.
2. Confirm email if enabled by Supabase Auth.
3. Open Supabase Dashboard → SQL Editor.
4. Run the following, replacing the email:
   ```sql
   update public.profiles set role='admin' where email='YOUR_REGISTERED_EMAIL';
   ```
5. Sign out and back in so the application refreshes the role.
6. As Admin: create classes and subjects; register teacher and student accounts; assign roles; create teacher-subject assignments; enroll students.

**Important:** Keep public sign-up enabled only if appropriate for your institution. Self-registration always creates Student profiles. Admin roles must be granted by an existing trusted administrator or directly through the Supabase dashboard.

## Deploy to GitHub Pages (Actions)
1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment → Source**, select **GitHub Actions** (not “Deploy from a branch”).
3. Save the setting. The workflow at `.github/workflows/pages.yml` deploys the repository root whenever a commit is pushed to `main`; you can also start it from **Actions → Deploy Attendly to GitHub Pages → Run workflow**.
4. Wait for the workflow's **build** and **deploy** jobs to finish successfully. Then open `https://omdugane27.github.io/Attendly-college-ERP-system-/`.
5. If the URL returns 404, confirm the Pages source is GitHub Actions and inspect the latest run under **Actions**.

This is a static frontend. Authentication and application data still depend on the configured Supabase project; GitHub Pages does not host the database or server-side functions.

## Android Acode
1. Copy `index.html`, `styles.css`, and `app.js` into the same directory in Acode. Keep the `supabase` and `tests` folders if you want the database and checks locally.
2. Open `index.html` in browser preview or use a local HTTP preview. Use a network-connected browser to access Supabase.
3. For robust auth email redirects, add the final site URL in Supabase Authentication → URL Configuration → Redirect URLs.

## Troubleshooting
- `Invalid API key`: confirm the project URL and publishable key at the top of `app.js`.
- Email confirmation: click the Supabase email confirmation link before signing in.
- Profile missing: check that the `on_auth_user_created` trigger exists and SQL ran successfully.
- No students in attendance roster: create student accounts, promote appropriate teacher roles, assign class subjects, and enroll students.
- Permission denied: inspect RLS; being logged in is not sufficient unless the current user has the correct role and assignment.
- User role change not reflected: sign out and back in after a role update.

## Security and limits
- RLS policies are applied on all exposed public tables; sensitive helper functions are in a non-exposed `private` schema.
- Do not expose database secret/service-role keys.
- Date filtering and CSV export use only records the signed-in account can access through RLS.
- This is a starter for review/testing, not a certified student information system. Before production use, test institution-specific policy requirements, configure backups, and review email delivery settings.


## Real-system feature upgrade (new)

An additional SQL migration is available at [`upgrade-real-system.sql`](./upgrade-real-system.sql). After the existing `schema.sql` has been applied, run this migration in Supabase SQL Editor to add:
- Student leave requests with teacher/admin review and status tracking.
- Attendance correction requests with approval/rejection workflow.
- Attendance audit logs with before/after JSON snapshots for attendance changes.

A second migration, [`upgrade-campus-features.sql`](./upgrade-campus-features.sql), adds timetable entries, role/class-targeted announcements and in-app notifications. Apply it only after both earlier SQL migrations.

This commit adds database tables, indexes, row-level security policies and an audit trigger. The existing frontend does not yet include dedicated screens/actions for these new modules; those UI workflows must be implemented and tested before treating them as fully available to users. The campus migration also adds database tables and triggers, but the current UI does not yet expose timetable, announcement-management or notification screens. Test RLS with separate admin, teacher and student accounts before production use.


## Campus Services Portal (new)

Open [`campus.html`](./campus.html) for the additional campus-services UI: leave requests and review, timetable view, announcements and in-app notifications. It uses the existing Supabase project and the tables from `upgrade-real-system.sql` and `upgrade-campus-features.sql`.

Before using it: apply `schema.sql`, then `upgrade-real-system.sql`, then `upgrade-campus-features.sql` in Supabase SQL Editor. The portal is an initial implementation, not a fully verified production release. In particular, validate teacher leave-review scope, notification generation, role-specific data visibility, and the timetable/admin editing workflow using test accounts before real institutional use.
