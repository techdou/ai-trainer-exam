import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ============================================================
 * 人工智能训练师五级练习与考试系统 — 数据库 Schema
 * 约定：
 *  - id: varchar(36) uuid pk
 *  - created_at / updated_at: timestamptz（业务默认 Asia/Shanghai，存储 UTC）
 *  - 软删除：deleted_at
 *  - 重要业务表带 organization_id
 * ============================================================ */

const id = () =>
  varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true });
const orgId = () => varchar("organization_id", { length: 36 });

/* ---------------- 1. 组织与人员 ---------------- */

export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    name: varchar("name", { length: 200 }).notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    contact: varchar("contact", { length: 200 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    created_at: createdAt(),
    updated_at: updatedAt(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("organizations_code_idx").on(t.code)]
);

export const trainingProjects = pgTable(
  "training_projects",
  {
    id: id(),
    organization_id: orgId()
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    funding_source: varchar("funding_source", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    start_at: timestamp("start_at", { withTimezone: true }),
    end_at: timestamp("end_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("training_projects_org_idx").on(t.organization_id)]
);

export const cohorts = pgTable(
  "cohorts",
  {
    id: id(),
    organization_id: orgId()
      .notNull()
      .references(() => organizations.id),
    project_id: varchar("project_id", { length: 36 }).references(
      () => trainingProjects.id
    ),
    name: varchar("name", { length: 200 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    created_at: createdAt(),
    updated_at: updatedAt(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("cohorts_org_idx").on(t.organization_id),
    index("cohorts_project_idx").on(t.project_id),
  ]
);

/** 用户档案：id 与 auth.users.id 对齐，个人信息最小化 */
export const profiles = pgTable(
  "profiles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organization_id: orgId().references(() => organizations.id),
    display_name: varchar("display_name", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }),
    student_no: varchar("student_no", { length: 64 }),
    phone: varchar("phone", { length: 32 }),
    must_change_password: boolean("must_change_password")
      .notNull()
      .default(false),
    onboarding_done: boolean("onboarding_done").notNull().default(false),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    index("profiles_org_idx").on(t.organization_id),
    index("profiles_email_idx").on(t.email),
    uniqueIndex("profiles_student_no_idx").on(t.student_no),
  ]
);

export const userRoles = pgTable(
  "user_roles",
  {
    id: id(),
    user_id: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    organization_id: orgId().references(() => organizations.id),
    role: varchar("role", { length: 32 }).notNull(),
    created_at: createdAt(),
  },
  (t) => [
    index("user_roles_user_idx").on(t.user_id),
    index("user_roles_org_role_idx").on(t.organization_id, t.role),
    uniqueIndex("user_roles_unique_idx").on(t.user_id, t.organization_id, t.role),
  ]
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: id(),
    cohort_id: varchar("cohort_id", { length: 36 })
      .notNull()
      .references(() => cohorts.id),
    user_id: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    index("enrollments_cohort_idx").on(t.cohort_id),
    index("enrollments_user_idx").on(t.user_id),
    uniqueIndex("enrollments_unique_idx").on(t.cohort_id, t.user_id),
  ]
);

/** 教师-班级授权 */
export const teacherCohortGrants = pgTable(
  "teacher_cohort_grants",
  {
    id: id(),
    cohort_id: varchar("cohort_id", { length: 36 })
      .notNull()
      .references(() => cohorts.id),
    teacher_id: varchar("teacher_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    created_at: createdAt(),
  },
  (t) => [
    index("teacher_grants_cohort_idx").on(t.cohort_id),
    index("teacher_grants_teacher_idx").on(t.teacher_id),
    uniqueIndex("teacher_grants_unique_idx").on(t.cohort_id, t.teacher_id),
  ]
);

/* ---------------- 2. 练习内容（与考试库物理隔离） ---------------- */

export const practiceQuestionItems = pgTable(
  "practice_question_items",
  {
    id: id(),
    organization_id: orgId(),
    question_type: varchar("question_type", { length: 32 }).notNull(),
    stem: text("stem").notNull(),
    options: jsonb("options").notNull().default([]),
    answer_key: jsonb("answer_key").notNull(),
    explanation: text("explanation"),
    knowledge_point: varchar("knowledge_point", { length: 200 }),
    difficulty: integer("difficulty").notNull().default(1),
    source: varchar("source", { length: 100 }).default("import"),
    source_version: varchar("source_version", { length: 100 }),
    review_status: varchar("review_status", { length: 32 })
      .notNull()
      .default("imported_unreviewed"),
    reviewer_id: varchar("reviewer_id", { length: 36 }),
    published_version: integer("published_version"),
    practice_only: boolean("practice_only").notNull().default(true),
    legal_review_required: boolean("legal_review_required")
      .notNull()
      .default(false),
    import_job_id: varchar("import_job_id", { length: 36 }),
    content_hash: varchar("content_hash", { length: 64 }),
    created_at: createdAt(),
    updated_at: updatedAt(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("pqi_status_idx").on(t.review_status),
    index("pqi_kp_idx").on(t.knowledge_point),
    index("pqi_hash_idx").on(t.content_hash),
    index("pqi_import_idx").on(t.import_job_id),
  ]
);

export const practiceTaskTemplates = pgTable(
  "practice_task_templates",
  {
    id: id(),
    organization_id: orgId(),
    task_type: varchar("task_type", { length: 48 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    instructions: text("instructions"),
    difficulty: integer("difficulty").notNull().default(1),
    config: jsonb("config").notNull().default({}),
    answer_key: jsonb("answer_key").notNull().default({}),
    grading_config: jsonb("grading_config").notNull().default({}),
    practice_only: boolean("practice_only").notNull().default(true),
    review_status: varchar("review_status", { length: 32 })
      .notNull()
      .default("draft"),
    published_version: integer("published_version"),
    created_at: createdAt(),
    updated_at: updatedAt(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("ptt_type_idx").on(t.task_type),
    index("ptt_status_idx").on(t.review_status),
  ]
);

export const practiceAssetVersions = pgTable(
  "practice_asset_versions",
  {
    id: id(),
    asset_kind: varchar("asset_kind", { length: 20 }).notNull(),
    object_key: varchar("object_key", { length: 500 }).notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    version: integer("version").notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("published"),
    meta: jsonb("meta").notNull().default({}),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("pav_kind_idx").on(t.asset_kind)]
);

export const practiceAssignments = pgTable(
  "practice_assignments",
  {
    id: id(),
    cohort_id: varchar("cohort_id", { length: 36 })
      .notNull()
      .references(() => cohorts.id),
    item_type: varchar("item_type", { length: 48 }).notNull(),
    item_id: varchar("item_id", { length: 36 }).notNull(),
    title: varchar("title", { length: 300 }),
    assigned_by: varchar("assigned_by", { length: 36 }).notNull(),
    due_at: timestamp("due_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [index("passign_cohort_idx").on(t.cohort_id)]
);

export const practiceAttempts = pgTable(
  "practice_attempts",
  {
    id: id(),
    user_id: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    item_type: varchar("item_type", { length: 48 }).notNull(),
    item_id: varchar("item_id", { length: 36 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("in_progress"),
    score: numeric("score", { precision: 8, scale: 2 }),
    max_score: numeric("max_score", { precision: 8, scale: 2 }),
    passed: boolean("passed"),
    feedback: jsonb("feedback").notNull().default({}),
    workspace_snapshot: jsonb("workspace_snapshot").notNull().default({}),
    operation_log: jsonb("operation_log").notNull().default([]),
    engine_version: varchar("engine_version", { length: 64 }),
    submitted_at: timestamp("submitted_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    index("pattempt_user_idx").on(t.user_id),
    index("pattempt_item_idx").on(t.item_type, t.item_id),
    index("pattempt_user_item_idx").on(t.user_id, t.item_type, t.item_id),
  ]
);

export const practiceWrongItems = pgTable(
  "practice_wrong_items",
  {
    id: id(),
    user_id: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    item_type: varchar("item_type", { length: 48 }).notNull(),
    item_id: varchar("item_id", { length: 36 }).notNull(),
    wrong_count: integer("wrong_count").notNull().default(1),
    resolved: boolean("resolved").notNull().default(false),
    last_wrong_at: timestamp("last_wrong_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    index("pwrong_user_idx").on(t.user_id),
    uniqueIndex("pwrong_unique_idx").on(t.user_id, t.item_type, t.item_id),
  ]
);

/* ---------------- 3. 正式考试内容（独立表，answer_key 仅服务端） ---------------- */

export const examQuestionItems = pgTable(
  "exam_question_items",
  {
    id: id(),
    organization_id: orgId(),
    question_type: varchar("question_type", { length: 32 }).notNull(),
    stem: text("stem").notNull(),
    options: jsonb("options").notNull().default([]),
    answer_key: jsonb("answer_key").notNull(),
    explanation: text("explanation"),
    knowledge_point: varchar("knowledge_point", { length: 200 }),
    difficulty: integer("difficulty").notNull().default(1),
    source: varchar("source", { length: 100 }).default("import"),
    source_version: varchar("source_version", { length: 100 }),
    review_status: varchar("review_status", { length: 32 })
      .notNull()
      .default("imported_unreviewed"),
    reviewer_id: varchar("reviewer_id", { length: 36 }),
    published_version: integer("published_version"),
    practice_only: boolean("practice_only").notNull().default(false),
    eligible_for_formal_exam: boolean("eligible_for_formal_exam")
      .notNull()
      .default(true),
    legal_review_required: boolean("legal_review_required")
      .notNull()
      .default(false),
    import_job_id: varchar("import_job_id", { length: 36 }),
    content_hash: varchar("content_hash", { length: 64 }),
    created_at: createdAt(),
    updated_at: updatedAt(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("eqi_status_idx").on(t.review_status),
    index("eqi_kp_idx").on(t.knowledge_point),
    index("eqi_hash_idx").on(t.content_hash),
  ]
);

export const examTaskTemplates = pgTable(
  "exam_task_templates",
  {
    id: id(),
    organization_id: orgId(),
    task_type: varchar("task_type", { length: 48 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    instructions: text("instructions"),
    difficulty: integer("difficulty").notNull().default(1),
    config: jsonb("config").notNull().default({}),
    answer_key: jsonb("answer_key").notNull().default({}),
    grading_config: jsonb("grading_config").notNull().default({}),
    practice_only: boolean("practice_only").notNull().default(false),
    eligible_for_formal_exam: boolean("eligible_for_formal_exam")
      .notNull()
      .default(true),
    review_status: varchar("review_status", { length: 32 })
      .notNull()
      .default("draft"),
    published_version: integer("published_version"),
    created_at: createdAt(),
    updated_at: updatedAt(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("ett_type_idx").on(t.task_type),
    index("ett_status_idx").on(t.review_status),
  ]
);

export const examAssetVersions = pgTable(
  "exam_asset_versions",
  {
    id: id(),
    asset_kind: varchar("asset_kind", { length: 20 }).notNull(),
    object_key: varchar("object_key", { length: 500 }).notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    version: integer("version").notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("published"),
    meta: jsonb("meta").notNull().default({}),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("eav_kind_idx").on(t.asset_kind)]
);

export const examPapers = pgTable(
  "exam_papers",
  {
    id: id(),
    organization_id: orgId(),
    title: varchar("title", { length: 300 }).notNull(),
    paper_kind: varchar("paper_kind", { length: 20 })
      .notNull()
      .default("formal"),
    config: jsonb("config").notNull().default({}),
    total_score: numeric("total_score", { precision: 8, scale: 2 })
      .notNull()
      .default("100"),
    pass_score: numeric("pass_score", { precision: 8, scale: 2 })
      .notNull()
      .default("60"),
    seed: integer("seed").notNull().default(0),
    duration_minutes: integer("duration_minutes").notNull().default(90),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    version: integer("version").notNull().default(1),
    created_at: createdAt(),
    updated_at: updatedAt(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("epapers_org_idx").on(t.organization_id),
    index("epapers_status_idx").on(t.status),
  ]
);

export const examPaperItems = pgTable(
  "exam_paper_items",
  {
    id: id(),
    paper_id: varchar("paper_id", { length: 36 })
      .notNull()
      .references(() => examPapers.id),
    item_type: varchar("item_type", { length: 48 }).notNull(),
    item_id: varchar("item_id", { length: 36 }).notNull(),
    sort_order: integer("sort_order").notNull().default(0),
    score: numeric("score", { precision: 8, scale: 2 }).notNull(),
    section: varchar("section", { length: 48 }).notNull().default("theory"),
    created_at: createdAt(),
  },
  (t) => [
    index("epitems_paper_idx").on(t.paper_id),
    uniqueIndex("epitems_unique_idx").on(t.paper_id, t.item_type, t.item_id),
  ]
);

export const examSchedules = pgTable(
  "exam_schedules",
  {
    id: id(),
    organization_id: orgId(),
    paper_id: varchar("paper_id", { length: 36 })
      .notNull()
      .references(() => examPapers.id),
    cohort_id: varchar("cohort_id", { length: 36 })
      .notNull()
      .references(() => cohorts.id),
    title: varchar("title", { length: 300 }).notNull(),
    practice_open_at: timestamp("practice_open_at", { withTimezone: true }),
    practice_lock_at: timestamp("practice_lock_at", { withTimezone: true }),
    exam_start_at: timestamp("exam_start_at", { withTimezone: true }).notNull(),
    exam_end_at: timestamp("exam_end_at", { withTimezone: true }).notNull(),
    late_entry_minutes: integer("late_entry_minutes").notNull().default(15),
    submit_grace_seconds: integer("submit_grace_seconds").notNull().default(60),
    results_release_at: timestamp("results_release_at", { withTimezone: true }),
    results_released: boolean("results_released").notNull().default(false),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    created_by: varchar("created_by", { length: 36 }),
    created_at: createdAt(),
    updated_at: updatedAt(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("eschedules_cohort_idx").on(t.cohort_id),
    index("eschedules_status_idx").on(t.status),
    index("eschedules_time_idx").on(t.exam_start_at, t.exam_end_at),
  ]
);

export const examAttempts = pgTable(
  "exam_attempts",
  {
    id: id(),
    schedule_id: varchar("schedule_id", { length: 36 })
      .notNull()
      .references(() => examSchedules.id),
    user_id: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    status: varchar("status", { length: 20 }).notNull().default("not_started"),
    started_at: timestamp("started_at", { withTimezone: true }),
    submitted_at: timestamp("submitted_at", { withTimezone: true }),
    server_deadline: timestamp("server_deadline", { withTimezone: true }),
    idempotency_key: varchar("idempotency_key", { length: 64 }),
    last_heartbeat_at: timestamp("last_heartbeat_at", { withTimezone: true }),
    ip: varchar("ip", { length: 64 }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    index("eattempts_schedule_idx").on(t.schedule_id),
    index("eattempts_user_idx").on(t.user_id),
    uniqueIndex("eattempts_unique_idx").on(t.schedule_id, t.user_id),
    uniqueIndex("eattempts_idem_idx").on(t.idempotency_key),
  ]
);

export const examResponses = pgTable(
  "exam_responses",
  {
    id: id(),
    attempt_id: varchar("attempt_id", { length: 36 })
      .notNull()
      .references(() => examAttempts.id),
    item_id: varchar("item_id", { length: 36 }).notNull(),
    item_type: varchar("item_type", { length: 48 }).notNull(),
    response: jsonb("response").notNull().default({}),
    workspace_snapshot: jsonb("workspace_snapshot").notNull().default({}),
    saved_at: timestamp("saved_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    index("eresponses_attempt_idx").on(t.attempt_id),
    uniqueIndex("eresponses_unique_idx").on(t.attempt_id, t.item_id),
  ]
);

export const examScores = pgTable(
  "exam_scores",
  {
    id: id(),
    attempt_id: varchar("attempt_id", { length: 36 })
      .notNull()
      .references(() => examAttempts.id),
    schedule_id: varchar("schedule_id", { length: 36 })
      .notNull()
      .references(() => examSchedules.id),
    user_id: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    theory_score: numeric("theory_score", { precision: 8, scale: 2 })
      .notNull()
      .default("0"),
    cleaning_score: numeric("cleaning_score", { precision: 8, scale: 2 })
      .notNull()
      .default("0"),
    image_annotation_score: numeric("image_annotation_score", {
      precision: 8,
      scale: 2,
    })
      .notNull()
      .default("0"),
    text_annotation_score: numeric("text_annotation_score", {
      precision: 8,
      scale: 2,
    })
      .notNull()
      .default("0"),
    audio_score: numeric("audio_score", { precision: 8, scale: 2 })
      .notNull()
      .default("0"),
    statistics_score: numeric("statistics_score", { precision: 8, scale: 2 })
      .notNull()
      .default("0"),
    total_score: numeric("total_score", { precision: 8, scale: 2 })
      .notNull()
      .default("0"),
    max_score: numeric("max_score", { precision: 8, scale: 2 })
      .notNull()
      .default("100"),
    passed: boolean("passed").notNull().default(false),
    engine_version: varchar("engine_version", { length: 64 }),
    paper_version: integer("paper_version"),
    auto_score_detail: jsonb("auto_score_detail").notNull().default({}),
    original_total: numeric("original_total", { precision: 8, scale: 2 }),
    adjusted_total: numeric("adjusted_total", { precision: 8, scale: 2 }),
    adjust_reason: text("adjust_reason"),
    adjusted_by: varchar("adjusted_by", { length: 36 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    index("escores_attempt_idx").on(t.attempt_id),
    index("escores_schedule_idx").on(t.schedule_id),
    index("escores_user_idx").on(t.user_id),
    uniqueIndex("escores_attempt_unique_idx").on(t.attempt_id),
  ]
);

export const examGradeReviews = pgTable(
  "exam_grade_reviews",
  {
    id: id(),
    score_id: varchar("score_id", { length: 36 })
      .notNull()
      .references(() => examScores.id),
    reviewer_id: varchar("reviewer_id", { length: 36 }).notNull(),
    action: varchar("action", { length: 32 }).notNull(),
    reason: text("reason").notNull(),
    before: jsonb("before").notNull().default({}),
    after: jsonb("after").notNull().default({}),
    created_at: createdAt(),
  },
  (t) => [index("ereviews_score_idx").on(t.score_id)]
);

/* ---------------- 4. 内容生产与审核 ---------------- */

export const importJobs = pgTable(
  "import_jobs",
  {
    id: id(),
    bank_type: varchar("bank_type", { length: 16 }).notNull(),
    file_key: varchar("file_key", { length: 500 }),
    file_name: varchar("file_name", { length: 300 }),
    status: varchar("status", { length: 20 }).notNull().default("processing"),
    total_count: integer("total_count").notNull().default(0),
    success_count: integer("success_count").notNull().default(0),
    error_count: integer("error_count").notNull().default(0),
    report: jsonb("report").notNull().default({}),
    created_by: varchar("created_by", { length: 36 }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("import_jobs_bank_idx").on(t.bank_type)]
);

export const questionReviewTasks = pgTable(
  "question_review_tasks",
  {
    id: id(),
    bank_type: varchar("bank_type", { length: 16 }).notNull(),
    item_id: varchar("item_id", { length: 36 }).notNull(),
    item_kind: varchar("item_kind", { length: 48 }).notNull(),
    issues: jsonb("issues").notNull().default([]),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    reviewer_id: varchar("reviewer_id", { length: 36 }),
    notes: text("notes"),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    index("qrt_status_idx").on(t.status),
    index("qrt_item_idx").on(t.bank_type, t.item_id),
  ]
);

export const mediaGenerationJobs = pgTable(
  "media_generation_jobs",
  {
    id: id(),
    media_kind: varchar("media_kind", { length: 20 }).notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    prompt: text("prompt"),
    params: jsonb("params").notNull().default({}),
    result_object_key: varchar("result_object_key", { length: 500 }),
    checksum: varchar("checksum", { length: 64 }),
    error: text("error"),
    created_by: varchar("created_by", { length: 36 }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("media_jobs_status_idx").on(t.status)]
);

export const assetManifests = pgTable(
  "asset_manifests",
  {
    id: id(),
    media_kind: varchar("media_kind", { length: 20 }).notNull(),
    object_key: varchar("object_key", { length: 500 }).notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    version: integer("version").notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    review_notes: text("review_notes"),
    reviewed_by: varchar("reviewed_by", { length: 36 }),
    transcript: text("transcript"),
    category: varchar("category", { length: 100 }),
    meta: jsonb("meta").notNull().default({}),
    job_id: varchar("job_id", { length: 36 }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    index("manifests_kind_status_idx").on(t.media_kind, t.status),
    index("manifests_category_idx").on(t.category),
  ]
);

export const gradingEngineVersions = pgTable(
  "grading_engine_versions",
  {
    id: id(),
    grader_name: varchar("grader_name", { length: 64 }).notNull(),
    version: varchar("version", { length: 32 }).notNull(),
    config: jsonb("config").notNull().default({}),
    created_at: createdAt(),
  },
  (t) => [
    uniqueIndex("gev_unique_idx").on(t.grader_name, t.version),
  ]
);

export const publicationRecords = pgTable(
  "publication_records",
  {
    id: id(),
    entity_type: varchar("entity_type", { length: 48 }).notNull(),
    entity_id: varchar("entity_id", { length: 36 }).notNull(),
    version: integer("version").notNull(),
    published_by: varchar("published_by", { length: 36 }).notNull(),
    created_at: createdAt(),
  },
  (t) => [index("pubrec_entity_idx").on(t.entity_type, t.entity_id)]
);

/* ---------------- 5. 运维与审计 ---------------- */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actor_id: varchar("actor_id", { length: 36 }),
    actor_role: varchar("actor_role", { length: 32 }),
    organization_id: orgId(),
    action: varchar("action", { length: 64 }).notNull(),
    entity_type: varchar("entity_type", { length: 48 }),
    entity_id: varchar("entity_id", { length: 36 }),
    detail: jsonb("detail").notNull().default({}),
    created_at: createdAt(),
  },
  (t) => [
    index("audit_actor_idx").on(t.actor_id),
    index("audit_entity_idx").on(t.entity_type, t.entity_id),
    index("audit_created_idx").on(t.created_at),
  ]
);

export const systemEvents = pgTable(
  "system_events",
  {
    id: id(),
    event_type: varchar("event_type", { length: 64 }).notNull(),
    payload: jsonb("payload").notNull().default({}),
    created_at: createdAt(),
  },
  (t) => [index("sysevents_type_idx").on(t.event_type)]
);

export const examHeartbeats = pgTable(
  "exam_heartbeats",
  {
    id: id(),
    attempt_id: varchar("attempt_id", { length: 36 })
      .notNull()
      .references(() => examAttempts.id),
    server_at: timestamp("server_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    client_offset_ms: integer("client_offset_ms"),
    status: varchar("status", { length: 20 }).notNull().default("ok"),
    created_at: createdAt(),
  },
  (t) => [index("eheartbeats_attempt_idx").on(t.attempt_id)]
);

export const exportJobs = pgTable(
  "export_jobs",
  {
    id: id(),
    export_type: varchar("export_type", { length: 64 }).notNull(),
    params: jsonb("params").notNull().default({}),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    result_object_key: varchar("result_object_key", { length: 500 }),
    error: text("error"),
    created_by: varchar("created_by", { length: 36 }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("export_jobs_type_idx").on(t.export_type)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    user_id: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    title: varchar("title", { length: 300 }).notNull(),
    body: text("body"),
    read: boolean("read").notNull().default(false),
    created_at: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.user_id)]
);

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: id(),
    flag_key: varchar("flag_key", { length: 100 }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    payload: jsonb("payload").notNull().default({}),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("feature_flags_key_idx").on(t.flag_key)]
);
