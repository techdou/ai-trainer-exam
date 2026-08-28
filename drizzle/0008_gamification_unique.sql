-- 0008: 积分账本幂等加固
-- 账本此前无唯一约束,幂等只靠应用层 check-then-insert(TOCTOU),并发双击可双倍计分。
-- 加业务唯一约束 (user_id, reason, ref_type, ref_id),配合应用层 ON CONFLICT DO NOTHING。
-- 先去重:每组保留最早一条(首次授予有效),按 (created_at, id) 打破完全同时间戳的平局。
DELETE FROM student_points_ledger a
  USING student_points_ledger b
  WHERE a.user_id = b.user_id
    AND a.reason = b.reason
    AND a.ref_type IS NOT DISTINCT FROM b.ref_type
    AND a.ref_id IS NOT DISTINCT FROM b.ref_id
    AND (a.created_at, a.id) > (b.created_at, b.id);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE student_points_ledger
    ADD CONSTRAINT student_points_ledger_ref_unique
    UNIQUE (user_id, reason, ref_type, ref_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
