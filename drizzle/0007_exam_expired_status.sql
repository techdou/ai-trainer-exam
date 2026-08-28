-- 超时未交卷(断线/掉电/恶意不交卷)的 attempt 此前永久卡在 in_progress,
-- 导致 scores/publish 的 active 检查永远拒绝发布整场成绩,只能手工改库。
-- 引入 expired 终态:超过 server_deadline + submit_grace_seconds 的 attempt
-- 由成绩发布入口和考试恢复入口自动落为 expired 并按 0 分(缺考)生成成绩。
ALTER TABLE exam_attempts DROP CONSTRAINT IF EXISTS exam_attempt_status_check;
ALTER TABLE exam_attempts ADD CONSTRAINT exam_attempt_status_check
  CHECK (status IN ('not_started','in_progress','submitted','grading','graded','released','void','expired'));
