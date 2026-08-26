-- 补齐线上库与迁移的漂移(线上手工加过、未回填迁移):
-- 1) 两张题库表的 created_by(题目录入人, varchar, 可空 — 与 VIEW 的 created_by 输出列对应)
-- 2) health_check 探活表(id 固定 1, updated_at 心跳)
ALTER TABLE "practice_question_items" ADD COLUMN IF NOT EXISTS "created_by" varchar;
ALTER TABLE "exam_question_items" ADD COLUMN IF NOT EXISTS "created_by" varchar;

CREATE TABLE IF NOT EXISTS "health_check" (
  "id" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "health_check_id_pk" PRIMARY KEY ("id")
);
INSERT INTO "health_check" ("id") VALUES (1) ON CONFLICT DO NOTHING;
