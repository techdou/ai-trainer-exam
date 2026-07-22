CREATE TABLE "asset_manifests" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_kind" varchar(20) NOT NULL,
	"object_key" varchar(500) NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"review_notes" text,
	"reviewed_by" varchar(36),
	"transcript" text,
	"category" varchar(100),
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"job_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" varchar(36),
	"actor_role" varchar(32),
	"organization_id" varchar(36),
	"action" varchar(64) NOT NULL,
	"entity_type" varchar(48),
	"entity_id" varchar(36),
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"name" varchar(200) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_asset_versions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_kind" varchar(20) NOT NULL,
	"object_key" varchar(500) NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'published' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_attempts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"status" varchar(20) DEFAULT 'not_started' NOT NULL,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"server_deadline" timestamp with time zone,
	"idempotency_key" varchar(64),
	"last_heartbeat_at" timestamp with time zone,
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_grade_reviews" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score_id" varchar(36) NOT NULL,
	"reviewer_id" varchar(36) NOT NULL,
	"action" varchar(32) NOT NULL,
	"reason" text NOT NULL,
	"before" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"after" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_heartbeats" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" varchar(36) NOT NULL,
	"server_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_offset_ms" integer,
	"status" varchar(20) DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_paper_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_id" varchar(36) NOT NULL,
	"item_type" varchar(48) NOT NULL,
	"item_id" varchar(36) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"score" numeric(8, 2) NOT NULL,
	"section" varchar(48) DEFAULT 'theory' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_papers" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(36),
	"title" varchar(300) NOT NULL,
	"paper_kind" varchar(20) DEFAULT 'formal' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_score" numeric(8, 2) DEFAULT '100' NOT NULL,
	"pass_score" numeric(8, 2) DEFAULT '60' NOT NULL,
	"seed" integer DEFAULT 0 NOT NULL,
	"duration_minutes" integer DEFAULT 90 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_question_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(36),
	"question_type" varchar(32) NOT NULL,
	"stem" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer_key" jsonb NOT NULL,
	"explanation" text,
	"knowledge_point" varchar(200),
	"difficulty" integer DEFAULT 1 NOT NULL,
	"source" varchar(100) DEFAULT 'import',
	"source_version" varchar(100),
	"review_status" varchar(32) DEFAULT 'imported_unreviewed' NOT NULL,
	"reviewer_id" varchar(36),
	"published_version" integer,
	"practice_only" boolean DEFAULT false NOT NULL,
	"eligible_for_formal_exam" boolean DEFAULT true NOT NULL,
	"legal_review_required" boolean DEFAULT false NOT NULL,
	"import_job_id" varchar(36),
	"content_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_responses" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" varchar(36) NOT NULL,
	"item_id" varchar(36) NOT NULL,
	"item_type" varchar(48) NOT NULL,
	"response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"workspace_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_schedules" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(36),
	"paper_id" varchar(36) NOT NULL,
	"cohort_id" varchar(36) NOT NULL,
	"title" varchar(300) NOT NULL,
	"practice_open_at" timestamp with time zone,
	"practice_lock_at" timestamp with time zone,
	"exam_start_at" timestamp with time zone NOT NULL,
	"exam_end_at" timestamp with time zone NOT NULL,
	"late_entry_minutes" integer DEFAULT 15 NOT NULL,
	"submit_grace_seconds" integer DEFAULT 60 NOT NULL,
	"results_release_at" timestamp with time zone,
	"results_released" boolean DEFAULT false NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_scores" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" varchar(36) NOT NULL,
	"schedule_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"theory_score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"cleaning_score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"image_annotation_score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"text_annotation_score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"audio_score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"statistics_score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"total_score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"max_score" numeric(8, 2) DEFAULT '100' NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"engine_version" varchar(64),
	"paper_version" integer,
	"auto_score_detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"original_total" numeric(8, 2),
	"adjusted_total" numeric(8, 2),
	"adjust_reason" text,
	"adjusted_by" varchar(36),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_task_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(36),
	"task_type" varchar(48) NOT NULL,
	"title" varchar(300) NOT NULL,
	"instructions" text,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"answer_key" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"grading_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"practice_only" boolean DEFAULT false NOT NULL,
	"eligible_for_formal_exam" boolean DEFAULT true NOT NULL,
	"review_status" varchar(32) DEFAULT 'draft' NOT NULL,
	"published_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_type" varchar(64) NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"result_object_key" varchar(500),
	"error" text,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_key" varchar(100) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grading_engine_versions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grader_name" varchar(64) NOT NULL,
	"version" varchar(32) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_type" varchar(16) NOT NULL,
	"file_key" varchar(500),
	"file_name" varchar(300),
	"status" varchar(20) DEFAULT 'processing' NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_generation_jobs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_kind" varchar(20) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"prompt" text,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_object_key" varchar(500),
	"checksum" varchar(64),
	"error" text,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"title" varchar(300) NOT NULL,
	"body" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"code" varchar(64) NOT NULL,
	"contact" varchar(200),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "practice_asset_versions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_kind" varchar(20) NOT NULL,
	"object_key" varchar(500) NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'published' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "practice_assignments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" varchar(36) NOT NULL,
	"item_type" varchar(48) NOT NULL,
	"item_id" varchar(36) NOT NULL,
	"title" varchar(300),
	"assigned_by" varchar(36) NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_attempts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"item_type" varchar(48) NOT NULL,
	"item_id" varchar(36) NOT NULL,
	"status" varchar(20) DEFAULT 'in_progress' NOT NULL,
	"score" numeric(8, 2),
	"max_score" numeric(8, 2),
	"passed" boolean,
	"feedback" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"workspace_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"operation_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"engine_version" varchar(64),
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "practice_question_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(36),
	"question_type" varchar(32) NOT NULL,
	"stem" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer_key" jsonb NOT NULL,
	"explanation" text,
	"knowledge_point" varchar(200),
	"difficulty" integer DEFAULT 1 NOT NULL,
	"source" varchar(100) DEFAULT 'import',
	"source_version" varchar(100),
	"review_status" varchar(32) DEFAULT 'imported_unreviewed' NOT NULL,
	"reviewer_id" varchar(36),
	"published_version" integer,
	"practice_only" boolean DEFAULT true NOT NULL,
	"legal_review_required" boolean DEFAULT false NOT NULL,
	"import_job_id" varchar(36),
	"content_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "practice_task_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(36),
	"task_type" varchar(48) NOT NULL,
	"title" varchar(300) NOT NULL,
	"instructions" text,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"answer_key" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"grading_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"practice_only" boolean DEFAULT true NOT NULL,
	"review_status" varchar(32) DEFAULT 'draft' NOT NULL,
	"published_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "practice_wrong_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"item_type" varchar(48) NOT NULL,
	"item_id" varchar(36) NOT NULL,
	"wrong_count" integer DEFAULT 1 NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"last_wrong_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36),
	"display_name" varchar(100) NOT NULL,
	"student_no" varchar(64),
	"phone" varchar(32),
	"must_change_password" boolean DEFAULT false NOT NULL,
	"onboarding_done" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "publication_records" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(48) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"version" integer NOT NULL,
	"published_by" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_review_tasks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_type" varchar(16) NOT NULL,
	"item_id" varchar(36) NOT NULL,
	"item_kind" varchar(48) NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reviewer_id" varchar(36),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_cohort_grants" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" varchar(36) NOT NULL,
	"teacher_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_projects" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"funding_source" varchar(100),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"organization_id" varchar(36),
	"role" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_project_id_training_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."training_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_schedule_id_exam_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."exam_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_grade_reviews" ADD CONSTRAINT "exam_grade_reviews_score_id_exam_scores_id_fk" FOREIGN KEY ("score_id") REFERENCES "public"."exam_scores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_heartbeats" ADD CONSTRAINT "exam_heartbeats_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_paper_items" ADD CONSTRAINT "exam_paper_items_paper_id_exam_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."exam_papers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_responses" ADD CONSTRAINT "exam_responses_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_paper_id_exam_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."exam_papers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_scores" ADD CONSTRAINT "exam_scores_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_scores" ADD CONSTRAINT "exam_scores_schedule_id_exam_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."exam_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_scores" ADD CONSTRAINT "exam_scores_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_assignments" ADD CONSTRAINT "practice_assignments_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_wrong_items" ADD CONSTRAINT "practice_wrong_items_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_cohort_grants" ADD CONSTRAINT "teacher_cohort_grants_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_cohort_grants" ADD CONSTRAINT "teacher_cohort_grants_teacher_id_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_projects" ADD CONSTRAINT "training_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manifests_kind_status_idx" ON "asset_manifests" USING btree ("media_kind","status");--> statement-breakpoint
CREATE INDEX "manifests_category_idx" ON "asset_manifests" USING btree ("category");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cohorts_org_idx" ON "cohorts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cohorts_project_idx" ON "cohorts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "enrollments_cohort_idx" ON "enrollments" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "enrollments_user_idx" ON "enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_unique_idx" ON "enrollments" USING btree ("cohort_id","user_id");--> statement-breakpoint
CREATE INDEX "eav_kind_idx" ON "exam_asset_versions" USING btree ("asset_kind");--> statement-breakpoint
CREATE INDEX "eattempts_schedule_idx" ON "exam_attempts" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "eattempts_user_idx" ON "exam_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eattempts_unique_idx" ON "exam_attempts" USING btree ("schedule_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eattempts_idem_idx" ON "exam_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ereviews_score_idx" ON "exam_grade_reviews" USING btree ("score_id");--> statement-breakpoint
CREATE INDEX "eheartbeats_attempt_idx" ON "exam_heartbeats" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "epitems_paper_idx" ON "exam_paper_items" USING btree ("paper_id");--> statement-breakpoint
CREATE UNIQUE INDEX "epitems_unique_idx" ON "exam_paper_items" USING btree ("paper_id","item_type","item_id");--> statement-breakpoint
CREATE INDEX "epapers_org_idx" ON "exam_papers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "epapers_status_idx" ON "exam_papers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "eqi_status_idx" ON "exam_question_items" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "eqi_kp_idx" ON "exam_question_items" USING btree ("knowledge_point");--> statement-breakpoint
CREATE INDEX "eqi_hash_idx" ON "exam_question_items" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "eresponses_attempt_idx" ON "exam_responses" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eresponses_unique_idx" ON "exam_responses" USING btree ("attempt_id","item_id");--> statement-breakpoint
CREATE INDEX "eschedules_cohort_idx" ON "exam_schedules" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "eschedules_status_idx" ON "exam_schedules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "eschedules_time_idx" ON "exam_schedules" USING btree ("exam_start_at","exam_end_at");--> statement-breakpoint
CREATE INDEX "escores_attempt_idx" ON "exam_scores" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "escores_schedule_idx" ON "exam_scores" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "escores_user_idx" ON "exam_scores" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "escores_attempt_unique_idx" ON "exam_scores" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "ett_type_idx" ON "exam_task_templates" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "ett_status_idx" ON "exam_task_templates" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "export_jobs_type_idx" ON "export_jobs" USING btree ("export_type");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flags_key_idx" ON "feature_flags" USING btree ("flag_key");--> statement-breakpoint
CREATE UNIQUE INDEX "gev_unique_idx" ON "grading_engine_versions" USING btree ("grader_name","version");--> statement-breakpoint
CREATE INDEX "import_jobs_bank_idx" ON "import_jobs" USING btree ("bank_type");--> statement-breakpoint
CREATE INDEX "media_jobs_status_idx" ON "media_generation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_code_idx" ON "organizations" USING btree ("code");--> statement-breakpoint
CREATE INDEX "pav_kind_idx" ON "practice_asset_versions" USING btree ("asset_kind");--> statement-breakpoint
CREATE INDEX "passign_cohort_idx" ON "practice_assignments" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "pattempt_user_idx" ON "practice_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pattempt_item_idx" ON "practice_attempts" USING btree ("item_type","item_id");--> statement-breakpoint
CREATE INDEX "pattempt_user_item_idx" ON "practice_attempts" USING btree ("user_id","item_type","item_id");--> statement-breakpoint
CREATE INDEX "pqi_status_idx" ON "practice_question_items" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "pqi_kp_idx" ON "practice_question_items" USING btree ("knowledge_point");--> statement-breakpoint
CREATE INDEX "pqi_hash_idx" ON "practice_question_items" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "pqi_import_idx" ON "practice_question_items" USING btree ("import_job_id");--> statement-breakpoint
CREATE INDEX "ptt_type_idx" ON "practice_task_templates" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "ptt_status_idx" ON "practice_task_templates" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "pwrong_user_idx" ON "practice_wrong_items" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pwrong_unique_idx" ON "practice_wrong_items" USING btree ("user_id","item_type","item_id");--> statement-breakpoint
CREATE INDEX "profiles_org_idx" ON "profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_student_no_idx" ON "profiles" USING btree ("student_no");--> statement-breakpoint
CREATE INDEX "pubrec_entity_idx" ON "publication_records" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "qrt_status_idx" ON "question_review_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "qrt_item_idx" ON "question_review_tasks" USING btree ("bank_type","item_id");--> statement-breakpoint
CREATE INDEX "sysevents_type_idx" ON "system_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "teacher_grants_cohort_idx" ON "teacher_cohort_grants" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "teacher_grants_teacher_idx" ON "teacher_cohort_grants" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_grants_unique_idx" ON "teacher_cohort_grants" USING btree ("cohort_id","teacher_id");--> statement-breakpoint
CREATE INDEX "training_projects_org_idx" ON "training_projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_org_role_idx" ON "user_roles" USING btree ("organization_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_unique_idx" ON "user_roles" USING btree ("user_id","organization_id","role");