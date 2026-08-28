-- 0009: 视图安全加固 + health_check RLS 补漏
-- 1) question_items VIEW 含两库 answer_key/explanation, 默认以 owner 权限执行(definer 语义),
--    若 anon/authenticated 拿到 SELECT 授权则绕过底表 deny-all RLS。
--    改为 security_invoker(以调用者权限执行, PG15+), 并显式 REVOKE 未认证角色的授权。
CREATE OR REPLACE VIEW "question_items" WITH (security_invoker = true) AS
 SELECT practice_question_items.id,
    'practice'::text AS bank_type,
    practice_question_items.organization_id,
    practice_question_items.question_type,
    practice_question_items.stem,
    practice_question_items.options,
    practice_question_items.answer_key,
    practice_question_items.explanation,
    practice_question_items.knowledge_point,
    practice_question_items.difficulty,
    practice_question_items.source,
    practice_question_items.source_version,
    practice_question_items.review_status,
    practice_question_items.reviewer_id,
    practice_question_items.published_version,
    practice_question_items.practice_only,
    practice_question_items.legal_review_required,
    false AS eligible_for_formal_exam,
    NULL::character varying AS created_by,
    practice_question_items.import_job_id,
    practice_question_items.content_hash,
    practice_question_items.created_at,
    practice_question_items.updated_at,
    practice_question_items.deleted_at
   FROM practice_question_items
UNION ALL
 SELECT exam_question_items.id,
    'exam'::text AS bank_type,
    exam_question_items.organization_id,
    exam_question_items.question_type,
    exam_question_items.stem,
    exam_question_items.options,
    exam_question_items.answer_key,
    exam_question_items.explanation,
    exam_question_items.knowledge_point,
    exam_question_items.difficulty,
    exam_question_items.source,
    exam_question_items.source_version,
    exam_question_items.review_status,
    exam_question_items.reviewer_id,
    exam_question_items.published_version,
    exam_question_items.practice_only,
    exam_question_items.legal_review_required,
    exam_question_items.eligible_for_formal_exam,
    NULL::character varying AS created_by,
    exam_question_items.import_job_id,
    exam_question_items.content_hash,
    exam_question_items.created_at,
    exam_question_items.updated_at,
    exam_question_items.deleted_at
   FROM exam_question_items;
--> statement-breakpoint
REVOKE ALL ON "question_items" FROM anon, authenticated;
--> statement-breakpoint
-- 2) health_check 建表晚于 0003 的 RLS 循环,补上同模式 deny-all 兜底(数据不敏感,保持策略完备)。
DO $$ BEGIN
  ALTER TABLE "health_check" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "health_check" FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS deny_all_anon ON "health_check";
  CREATE POLICY deny_all_anon ON "health_check" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
END $$;
