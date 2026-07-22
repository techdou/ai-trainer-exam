# DATA_MODEL.md — 数据模型

> 所有表默认含 `id` (uuid pk)、`created_at`、`updated_at`（日志类仅 created_at）。字段一律 snake_case。删除优先软删除（`deleted_at`）。重要业务表含 `organization_id`。

## 1. 组织与人员

| 表 | 关键字段 | 说明 |
|---|---|---|
| organizations | name, code | 学校/机构 |
| training_projects | organization_id, name, status | 培训项目（财政项目可核验） |
| cohorts | organization_id, project_id, name | 班级 |
| profiles | id(=auth.users.id), organization_id, display_name, phone | 用户档案（个人信息最小化） |
| user_roles | user_id, organization_id, role | 角色：super_admin / school_admin / teacher / question_editor / question_reviewer / proctor / student / auditor |
| enrollments | cohort_id, user_id, status | 学员-班级关系 |

## 2. 练习内容（practice_* 独立 schema 前缀）

| 表 | 关键字段 | 说明 |
|---|---|---|
| practice_question_items | question_type(single_choice/true_false), stem, options(jsonb), answer_key(jsonb), explanation, knowledge_point, difficulty, source, source_version, review_status, reviewer_id, published_version, practice_only, legal_review_required, import_job_id, content_hash | 理论练习题 |
| practice_task_templates | task_type, title, instructions, difficulty, config(jsonb 初始数据), answer_key(jsonb), practice_only, review_status, published_version | 实操练习题模板；task_type ∈ spreadsheet_row_deletion / file_classification / image_dataset_cleaning / image_annotation / sentiment_label / audio_transcription / statistics_sheet |
| practice_asset_versions | asset_kind(image/audio), object_key, checksum, version, status, meta | 练习素材版本 |
| practice_assignments | cohort_id, item_type, item_id, assigned_by, due_at | 教师指定作业 |
| practice_attempts | user_id, item_type, item_id, status, score, max_score, feedback(jsonb), workspace_snapshot(jsonb), submitted_at | 练习记录（含工作区快照） |
| practice_wrong_items | user_id, item_type, item_id, wrong_count, resolved | 错题本 |

## 3. 正式考试内容（exam_* 与练习库物理隔离）

| 表 | 关键字段 | 说明 |
|---|---|---|
| exam_question_items | 同 practice_question_items 结构 + 独立 ID/版本 | 考试理论题（RLS 拒绝学员） |
| exam_task_templates | 同 practice_task_templates 结构 | 考试实操模板 |
| exam_asset_versions | 同 practice_asset_versions | 考试素材（冻结） |
| exam_papers | title, config(jsonb), total_score, pass_score, seed, status, version | 试卷（组卷后冻结） |
| exam_paper_items | paper_id, item_type, item_id, sort_order, score, section | 试卷题目 |
| exam_schedules | paper_id, cohort_id, practice_open_at, practice_lock_at, exam_start_at, exam_end_at, late_entry_minutes, submit_grace_seconds, results_release_at, status | 考试计划（状态机见 ARCHITECTURE） |
| exam_attempts | schedule_id, user_id, status(not_started/in_progress/submitted/expired), started_at, submitted_at, server_deadline, idempotency_key | 考试会话 |
| exam_responses | attempt_id, item_id, item_type, response(jsonb), workspace_snapshot(jsonb) | 作答（自动保存 upsert） |
| exam_scores | attempt_id, schedule_id, user_id, theory_score, cleaning_score, image_annotation_score, text_annotation_score, audio_score, statistics_score, total_score, passed, engine_version, paper_version, auto_score_detail(jsonb), original_total, adjusted_total, adjust_reason, adjusted_by, status | 成绩（原始分/调整分/最终分） |
| exam_grade_reviews | score_id, reviewer_id, action, reason, before(jsonb), after(jsonb) | 成绩复核/调整记录 |

## 4. 内容生产与审核

| 表 | 说明 |
|---|---|
| import_jobs | bank_type, file_key, status, total/success/error_count, report(jsonb 质检结果) |
| question_review_tasks | bank_type, item_id, item_kind, status, reviewer_id, notes |
| media_generation_jobs | media_kind(image/audio), provider(skill/mock), status, prompt, params, result_object_key, error |
| asset_manifests | media_kind, object_key, checksum, version, status(draft/reviewing/approved/published), review_notes, meta |
| grading_engine_versions | grader_name, version, config |
| publication_records | entity_type, entity_id, version, published_by |

## 5. 运维与审计

| 表 | 说明 |
|---|---|
| audit_logs | actor_id, actor_role, action, entity_type, entity_id, detail(jsonb) — 所有重要操作 |
| system_events | 系统级事件（自动交卷批处理等） |
| exam_heartbeats | attempt_id, server_at, status — 服务端心跳与时间校准 |
| export_jobs | export_type, params, status, result_object_key |
| notifications | user_id, title, body, read |
| feature_flags | flag_key, enabled, payload |

## RLS 策略概览

| 表族 | 学员 | 教师 | 管理 | service_role |
|---|---|---|---|---|
| profiles/user_roles/enrollments | 仅自己 | 授权班级 | 本机构 | 全部 |
| practice_* 题目 | published 可读（不含答案字段由 API 剔除） | 读 | 写 | 全部 |
| practice_attempts/wrong_items | 仅自己 | 授权班级学员 | 本机构 | 全部 |
| exam_question_items / exam_task_templates（含 answer_key） | ❌ 拒绝 | ❌ 拒绝 | ❌ 拒绝（走 service） | ✅ |
| exam_papers/schedules | 元信息可读（无答案） | 读 | 写 | 全部 |
| exam_attempts/responses | 仅自己 | 监控可读状态 | 本机构 | 全部 |
| exam_scores | 发布后仅自己 | 授权班级 | 本机构 | 全部 |
| audit_logs | ❌ | ❌ | auditor+admin 读 | 全部 |

## 迁移与回滚

- 定义：`src/storage/database/schema.ts`（Drizzle）
- 同步：`coze-coding-ai db upgrade`（自动生成 DDL）
- RLS：SQL 脚本 `scripts/rls/*.sql`，用 exec_sql 执行
- 回滚：Drizzle  downgrade 需手工反向 DDL；每次结构变更记录在 DECISIONS.md
- 环境隔离：DEV/PROD 各一套 Supabase 实例（部署后运行 check_supabase_consistency.py 核验）
