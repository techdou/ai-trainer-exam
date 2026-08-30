-- 0010: 题库开放制（机构级共享）
-- 三态可见性: organization_id=NULL 全局开放 / =机构 私有 / shares 表开放给指定机构。
-- 理论题与实操任务模板共用本表; 唯一约束防重复开放。
-- 注: 本项目主键约定为 varchar 存 uuid 字符串,列类型与其对齐。
CREATE TABLE IF NOT EXISTS question_bank_shares (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  resource_type text NOT NULL,   -- 'practice_question' | 'exam_question' | 'practice_task' | 'exam_task'
  resource_id varchar NOT NULL,
  organization_id varchar NOT NULL REFERENCES organizations(id),
  created_by varchar,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (resource_type, resource_id, organization_id)
);
CREATE INDEX IF NOT EXISTS idx_qbs_resource ON question_bank_shares(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_qbs_org ON question_bank_shares(organization_id);
