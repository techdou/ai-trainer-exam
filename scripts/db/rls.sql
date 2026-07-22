-- RLS 策略：纵深防御（应用层校验为主，RLS 兜底）
-- 浏览器仅持 anon key 用于认证；所有数据访问经服务端 API（service 连接，绕过 RLS）

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'organizations','training_projects','cohorts','profiles','user_roles','enrollments','teacher_cohort_grants',
    'practice_question_items','practice_task_templates','practice_asset_versions','practice_assignments',
    'practice_attempts','practice_wrong_items',
    'exam_question_items','exam_task_templates','exam_asset_versions','exam_papers','exam_paper_items',
    'exam_schedules','exam_attempts','exam_responses','exam_scores','exam_grade_reviews',
    'import_jobs','question_review_tasks','media_generation_jobs','asset_manifests',
    'grading_engine_versions','publication_records',
    'audit_logs','system_events','exam_heartbeats','export_jobs','notifications','feature_flags'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- 默认拒绝 anon/authenticated 的一切访问（service_role 绕过 RLS 不受影响）
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'organizations','training_projects','cohorts','profiles','user_roles','enrollments','teacher_cohort_grants',
    'practice_question_items','practice_task_templates','practice_asset_versions','practice_assignments',
    'practice_attempts','practice_wrong_items',
    'exam_question_items','exam_task_templates','exam_asset_versions','exam_papers','exam_paper_items',
    'exam_schedules','exam_attempts','exam_responses','exam_scores','exam_grade_reviews',
    'import_jobs','question_review_tasks','media_generation_jobs','asset_manifests',
    'grading_engine_versions','publication_records',
    'audit_logs','system_events','exam_heartbeats','export_jobs','notifications','feature_flags'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS deny_all_anon ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY deny_all_anon ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t);
  END LOOP;
END $$;
