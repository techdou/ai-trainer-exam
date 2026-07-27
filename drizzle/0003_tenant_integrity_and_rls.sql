-- Tenant integrity and complete RLS deny-by-default coverage.

ALTER TABLE practice_task_templates ADD COLUMN IF NOT EXISTS created_by varchar(36);
ALTER TABLE practice_task_templates ADD COLUMN IF NOT EXISTS reviewer_id varchar(36);
ALTER TABLE exam_task_templates ADD COLUMN IF NOT EXISTS created_by varchar(36);
ALTER TABLE exam_task_templates ADD COLUMN IF NOT EXISTS reviewer_id varchar(36);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM enrollments e
      JOIN profiles p ON p.id = e.user_id
      JOIN cohorts c ON c.id = e.cohort_id
     WHERE p.organization_id IS NULL
        OR p.organization_id IS DISTINCT FROM c.organization_id
  ) THEN
    RAISE EXCEPTION 'Cannot enable enrollment tenant guard: cross-organization enrollment exists';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_enrollment_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  profile_org varchar(36);
  cohort_org varchar(36);
BEGIN
  SELECT organization_id INTO profile_org FROM profiles WHERE id = NEW.user_id;
  SELECT organization_id INTO cohort_org FROM cohorts WHERE id = NEW.cohort_id;
  IF profile_org IS NULL OR cohort_org IS NULL OR profile_org IS DISTINCT FROM cohort_org THEN
    RAISE EXCEPTION 'Enrollment user and cohort must belong to the same organization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enrollments_organization_guard ON enrollments;
CREATE TRIGGER enrollments_organization_guard
BEFORE INSERT OR UPDATE OF user_id, cohort_id ON enrollments
FOR EACH ROW EXECUTE FUNCTION public.enforce_enrollment_organization();

CREATE OR REPLACE FUNCTION public.enforce_teacher_grant_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  teacher_org varchar(36);
  cohort_org varchar(36);
BEGIN
  SELECT organization_id INTO teacher_org FROM profiles WHERE id = NEW.teacher_id;
  SELECT organization_id INTO cohort_org FROM cohorts WHERE id = NEW.cohort_id;
  IF teacher_org IS NULL OR cohort_org IS NULL OR teacher_org IS DISTINCT FROM cohort_org THEN
    RAISE EXCEPTION 'Teacher and cohort grant must belong to the same organization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS teacher_grants_organization_guard ON teacher_cohort_grants;
CREATE TRIGGER teacher_grants_organization_guard
BEFORE INSERT OR UPDATE OF teacher_id, cohort_id ON teacher_cohort_grants
FOR EACH ROW EXECUTE FUNCTION public.enforce_teacher_grant_organization();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM user_roles ur
      JOIN profiles p ON p.id = ur.user_id
     WHERE (ur.role IN ('super_admin', 'auditor') AND ur.organization_id IS NOT NULL)
        OR (
          ur.role NOT IN ('super_admin', 'auditor')
          AND (ur.organization_id IS NULL OR p.organization_id IS DISTINCT FROM ur.organization_id)
        )
  ) THEN
    RAISE EXCEPTION 'Cannot enable user role tenant guard: inconsistent role organization exists';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_user_role_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  profile_org varchar(36);
BEGIN
  SELECT organization_id INTO profile_org FROM profiles WHERE id = NEW.user_id;
  IF NEW.role IN ('super_admin', 'auditor') THEN
    IF NEW.organization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Global roles cannot be organization-bound' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.organization_id IS NULL OR profile_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Tenant role must match the profile organization' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_roles_organization_guard ON user_roles;
CREATE TRIGGER user_roles_organization_guard
BEFORE INSERT OR UPDATE OF user_id, role, organization_id ON user_roles
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_role_organization();

-- The browser only receives an anon key for Auth. All application data access goes
-- through the service-role BFF, so direct anon/authenticated access is denied.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organizations','training_projects','cohorts','profiles','user_roles','enrollments','teacher_cohort_grants',
    'practice_question_items','practice_task_templates','practice_asset_versions','practice_assignments',
    'practice_attempts','practice_wrong_items',
    'exam_question_items','exam_task_templates','exam_asset_versions','exam_papers','exam_paper_items',
    'exam_schedules','exam_attempts','exam_responses','exam_scores','exam_grade_reviews',
    'import_jobs','question_review_tasks','media_generation_jobs','asset_manifests',
    'grading_engine_versions','publication_records',
    'audit_logs','system_events','exam_heartbeats','export_jobs','notifications','feature_flags',
    'system_settings'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS deny_all_anon ON public.%I', table_name);
      EXECUTE format(
        'CREATE POLICY deny_all_anon ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        table_name
      );
    END IF;
  END LOOP;
END $$;
