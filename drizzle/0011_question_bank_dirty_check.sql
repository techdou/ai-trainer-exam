-- 0011: 题库脏数据 CHECK 约束——数据库层最后一道防线
-- 背景(2026-08-31 题库事故): seed/导入管线放进过 0 选项、答案越界的单选题,
-- 学生端遇 0 选项题界面死锁。应用层已在 bulkInsertQuestions/DOCX 导入器/seed 脚本
-- 加硬校验,本约束保证应用层防线全失守时脏数据也无法落表。
-- 注意: 应用本迁移前必须先清洗存量脏数据(重导 l5-quiz-v2 后按序执行),
-- 否则 ADD CONSTRAINT 会对存量违规行报错(这正是我们想要的失败方式:大声失败)。

ALTER TABLE practice_question_items
  ADD CONSTRAINT chk_single_choice_valid CHECK (
    question_type <> 'single_choice'
    OR (
      jsonb_typeof(options) = 'object'
      AND (SELECT count(*) FROM jsonb_object_keys(options)) >= 2
      AND jsonb_typeof(answer_key) = 'string'
      AND (answer_key #>> '{}') ~ '^[A-Z]$'
      AND options ? (answer_key #>> '{}')
    )
  );

ALTER TABLE exam_question_items
  ADD CONSTRAINT chk_single_choice_valid CHECK (
    question_type <> 'single_choice'
    OR (
      jsonb_typeof(options) = 'object'
      AND (SELECT count(*) FROM jsonb_object_keys(options)) >= 2
      AND jsonb_typeof(answer_key) = 'string'
      AND (answer_key #>> '{}') ~ '^[A-Z]$'
      AND options ? (answer_key #>> '{}')
    )
  );
