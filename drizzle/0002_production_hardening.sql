-- Production hardening: frozen paper items, deterministic grading details and audit-safe submission.

ALTER TABLE exam_paper_items ADD COLUMN IF NOT EXISTS item_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE exam_paper_items ADD COLUMN IF NOT EXISTS answer_key_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE exam_paper_items ADD COLUMN IF NOT EXISTS grading_config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE exam_paper_items ADD COLUMN IF NOT EXISTS grader_id varchar(64);
ALTER TABLE exam_paper_items ADD COLUMN IF NOT EXISTS grader_version varchar(64);
ALTER TABLE exam_paper_items ADD COLUMN IF NOT EXISTS asset_checksum varchar(64);

ALTER TABLE exam_responses ADD COLUMN IF NOT EXISTS score numeric(8,2) NOT NULL DEFAULT 0;
ALTER TABLE exam_responses ADD COLUMN IF NOT EXISTS max_score numeric(8,2) NOT NULL DEFAULT 0;
ALTER TABLE exam_responses ADD COLUMN IF NOT EXISTS grader_version varchar(64);
ALTER TABLE exam_responses ADD COLUMN IF NOT EXISTS grading_detail jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE exam_responses ADD COLUMN IF NOT EXISTS graded_at timestamptz;

ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS submission_hash varchar(64);
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS submit_receipt varchar(64);
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS client_version varchar(64);

ALTER TABLE practice_asset_versions ADD COLUMN IF NOT EXISTS organization_id varchar(36) REFERENCES organizations(id);
ALTER TABLE exam_asset_versions ADD COLUMN IF NOT EXISTS organization_id varchar(36) REFERENCES organizations(id);
ALTER TABLE media_generation_jobs ADD COLUMN IF NOT EXISTS organization_id varchar(36) REFERENCES organizations(id);
ALTER TABLE asset_manifests ADD COLUMN IF NOT EXISTS organization_id varchar(36) REFERENCES organizations(id);
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS organization_id varchar(36) REFERENCES organizations(id);

CREATE TABLE IF NOT EXISTS system_settings (
  key varchar(100) PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS exam_paper_items_type_idx ON exam_paper_items(paper_id, item_type, sort_order);
CREATE INDEX IF NOT EXISTS exam_attempts_deadline_idx ON exam_attempts(status, server_deadline);
CREATE INDEX IF NOT EXISTS media_jobs_org_idx ON media_generation_jobs(organization_id, status);
CREATE INDEX IF NOT EXISTS manifests_org_idx ON asset_manifests(organization_id, status);

DO $$ BEGIN
  ALTER TABLE exam_attempts ADD CONSTRAINT exam_attempt_status_check
    CHECK (status IN ('not_started','in_progress','submitted','grading','graded','released','void'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE exam_scores ADD CONSTRAINT exam_score_status_check
    CHECK (status IN ('pending','auto_graded','reviewed','published','void'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE exam_scores ADD CONSTRAINT exam_score_range_check
    CHECK (total_score >= 0 AND max_score >= 0 AND total_score <= max_score);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE exam_papers ADD CONSTRAINT exam_paper_status_check
    CHECK (status IN ('draft','published','retired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE exam_schedules ADD CONSTRAINT exam_schedule_status_check
    CHECK (status IN ('draft','published','waiting','practice_locked','exam_open','exam_closed','grading','results_pending','results_released','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- service-role BFF is the only supported data access path. Enabling RLS without
-- client policies denies direct anon/authenticated access while service-role keeps working.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organizations','training_projects','cohorts','profiles','user_roles','enrollments','teacher_cohort_grants',
    'practice_question_items','exam_question_items','practice_task_templates','exam_task_templates',
    'practice_assignments','practice_attempts','practice_wrong_items','exam_papers','exam_paper_items',
    'exam_schedules','exam_attempts','exam_responses','exam_scores','exam_grade_reviews',
    'media_generation_jobs','asset_manifests','audit_logs','export_jobs'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    END IF;
  END LOOP;
END $$;
