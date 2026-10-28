-- Fix class visibility for teachers and enrolled students.
-- The earlier live policy accidentally compared class IDs to row IDs.
DROP POLICY IF EXISTS "Classes visible to relevant users" ON public.classes;
DROP POLICY IF EXISTS classes_select_relevant ON public.classes;

CREATE POLICY classes_select_relevant
ON public.classes
FOR SELECT
TO authenticated
USING (
  private.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.class_subjects cs
    WHERE cs.class_id = classes.id
      AND cs.teacher_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.enrollments e
    WHERE e.class_id = classes.id
      AND e.student_id = (SELECT auth.uid())
  )
);
