-- Attendly college-grade academic, eligibility and integration foundation.
ALTER TABLE public.class_subjects
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS semester integer,
  ADD COLUMN IF NOT EXISTS course_type text NOT NULL DEFAULT 'core'
    CHECK (course_type IN ('core','elective','open_elective','mdc','lab','interdisciplinary')),
  ADD COLUMN IF NOT EXISTS batch_name text,
  ADD COLUMN IF NOT EXISTS credits numeric(4,1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.faculty_substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_subject_id uuid NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
  substitute_teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  approved_by uuid NOT NULL REFERENCES public.profiles(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS faculty_substitutions_lookup ON public.faculty_substitutions(class_subject_id, substitute_teacher_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS public.condonation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_subject_id uuid NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('medical','sports_duty','cultural_duty','placement_duty','other')),
  from_date date NOT NULL,
  to_date date NOT NULL,
  reason text NOT NULL,
  evidence_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date)
);
CREATE INDEX IF NOT EXISTS condonation_student_course ON public.condonation_requests(student_id, class_subject_id, status);

CREATE TABLE IF NOT EXISTS public.attendance_policy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text,
  semester integer,
  minimum_percentage numeric(5,2) NOT NULL DEFAULT 75 CHECK (minimum_percentage BETWEEN 0 AND 100),
  warning_percentage numeric(5,2) NOT NULL DEFAULT 80 CHECK (warning_percentage BETWEEN 0 AND 100),
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS public.parent_student_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(parent_user_id, student_id),
  CHECK (parent_user_id <> student_id)
);

CREATE TABLE IF NOT EXISTS public.integration_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('college_erp','sis','moodle','canvas','blackboard','webhook','other')),
  display_name text NOT NULL,
  base_url text,
  enabled boolean NOT NULL DEFAULT false,
  sync_direction text NOT NULL DEFAULT 'inbound' CHECK (sync_direction IN ('inbound','outbound','bidirectional')),
  last_synced_at timestamptz,
  last_sync_status text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Credentials must be stored in server-side secrets, never in this public table or browser code.
ALTER TABLE public.faculty_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condonation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_policy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS faculty_substitutions_select_relevant ON public.faculty_substitutions;
CREATE POLICY faculty_substitutions_select_relevant ON public.faculty_substitutions FOR SELECT TO authenticated USING (
  private.is_admin() OR substitute_teacher_id = (SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.id = class_subject_id AND cs.teacher_id = (SELECT auth.uid()))
);
DROP POLICY IF EXISTS faculty_substitutions_admin_manage ON public.faculty_substitutions;
CREATE POLICY faculty_substitutions_admin_manage ON public.faculty_substitutions FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS condonation_select_relevant ON public.condonation_requests;
CREATE POLICY condonation_select_relevant ON public.condonation_requests FOR SELECT TO authenticated USING (
  private.is_admin() OR student_id = (SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.id = class_subject_id AND cs.teacher_id = (SELECT auth.uid()))
);
DROP POLICY IF EXISTS condonation_student_insert ON public.condonation_requests;
CREATE POLICY condonation_student_insert ON public.condonation_requests FOR INSERT TO authenticated WITH CHECK (
  student_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.enrollments e JOIN public.class_subjects cs ON cs.class_id=e.class_id WHERE e.student_id=(SELECT auth.uid()) AND cs.id=class_subject_id)
);
DROP POLICY IF EXISTS condonation_reviewer_update ON public.condonation_requests;
CREATE POLICY condonation_reviewer_update ON public.condonation_requests FOR UPDATE TO authenticated USING (
  private.is_admin() OR EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.id=class_subject_id AND cs.teacher_id=(SELECT auth.uid()))
) WITH CHECK (
  private.is_admin() OR (reviewed_by=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.id=class_subject_id AND cs.teacher_id=(SELECT auth.uid())))
);

DROP POLICY IF EXISTS attendance_policy_settings_select ON public.attendance_policy_settings;
CREATE POLICY attendance_policy_settings_select ON public.attendance_policy_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS attendance_policy_settings_admin_manage ON public.attendance_policy_settings;
CREATE POLICY attendance_policy_settings_admin_manage ON public.attendance_policy_settings FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS parent_links_select_relevant ON public.parent_student_links;
CREATE POLICY parent_links_select_relevant ON public.parent_student_links FOR SELECT TO authenticated USING (private.is_admin() OR parent_user_id=(SELECT auth.uid()) OR student_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS parent_links_admin_manage ON public.parent_student_links;
CREATE POLICY parent_links_admin_manage ON public.parent_student_links FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS integration_endpoints_admin_only ON public.integration_endpoints;
CREATE POLICY integration_endpoints_admin_only ON public.integration_endpoints FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE OR REPLACE FUNCTION private.teaches_class_subject(p_class_subject_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.id = p_class_subject_id AND cs.teacher_id = (SELECT auth.uid()))
  OR EXISTS (SELECT 1 FROM public.faculty_substitutions fs WHERE fs.class_subject_id = p_class_subject_id AND fs.substitute_teacher_id = (SELECT auth.uid()) AND now() >= fs.starts_at AND now() < fs.ends_at)
$$;
REVOKE ALL ON FUNCTION private.teaches_class_subject(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.teaches_class_subject(uuid) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.faculty_substitutions, public.condonation_requests, public.attendance_policy_settings, public.parent_student_links, public.integration_endpoints TO authenticated;

CREATE OR REPLACE VIEW public.semester_attendance_eligibility
WITH (security_invoker = true) AS
SELECT e.student_id, cs.id AS class_subject_id, cs.class_id, cs.subject_id,
       cs.department, cs.semester, cs.course_type, cs.batch_name,
       count(ar.id)::integer AS total_sessions,
       count(ar.id) FILTER (WHERE ar.status IN ('present','late'))::integer AS attended_sessions,
       count(ar.id) FILTER (WHERE ar.status = 'absent')::integer AS absent_sessions,
       CASE WHEN count(ar.id)=0 THEN 0
            ELSE round(100.0 * count(ar.id) FILTER (WHERE ar.status IN ('present','late')) / count(ar.id), 2)
       END AS attendance_percentage,
       coalesce((
         SELECT aps.minimum_percentage FROM public.attendance_policy_settings aps
         WHERE (aps.department IS NULL OR aps.department=cs.department)
           AND (aps.semester IS NULL OR aps.semester=cs.semester)
           AND aps.effective_from<=current_date
           AND (aps.effective_to IS NULL OR aps.effective_to>=current_date)
         ORDER BY (aps.department IS NOT NULL)::int DESC,
                  (aps.semester IS NOT NULL)::int DESC, aps.effective_from DESC
         LIMIT 1
       ),75)::numeric(5,2) AS required_percentage,
       CASE WHEN count(ar.id)=0 THEN 'no_data'
            WHEN 100.0 * count(ar.id) FILTER (WHERE ar.status IN ('present','late')) / count(ar.id)
                 < coalesce((
                   SELECT aps.minimum_percentage FROM public.attendance_policy_settings aps
                   WHERE (aps.department IS NULL OR aps.department=cs.department)
                     AND (aps.semester IS NULL OR aps.semester=cs.semester)
                     AND aps.effective_from<=current_date
                     AND (aps.effective_to IS NULL OR aps.effective_to>=current_date)
                   ORDER BY (aps.department IS NOT NULL)::int DESC,
                            (aps.semester IS NOT NULL)::int DESC, aps.effective_from DESC
                   LIMIT 1
                 ),75)
            THEN 'below_threshold' ELSE 'eligible'
       END AS eligibility_status
FROM public.enrollments e
JOIN public.class_subjects cs ON cs.class_id=e.class_id
LEFT JOIN public.attendance_records ar
  ON ar.student_id=e.student_id AND ar.class_subject_id=cs.id
GROUP BY e.student_id,cs.id,cs.class_id,cs.subject_id,cs.department,
         cs.semester,cs.course_type,cs.batch_name;
GRANT SELECT ON public.semester_attendance_eligibility TO authenticated;
