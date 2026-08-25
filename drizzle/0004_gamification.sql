-- 0004: 学员激励层(积分流水 + 勋章记录)
-- RLS 与 0003 同模式: 全表 deny-all 兜底, 业务一律走服务端 service 连接做应用层鉴权。

CREATE TABLE IF NOT EXISTS "student_points_ledger" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"organization_id" varchar(36),
	"reason" varchar(64) NOT NULL,
	"points" integer NOT NULL,
	"ref_type" varchar(48),
	"ref_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_points_ledger_user" ON "student_points_ledger" ("user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_points_ledger_ref" ON "student_points_ledger" ("user_id", "reason", "ref_type", "ref_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_badges" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"badge_key" varchar(64) NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_badges_user_badge_unique" UNIQUE ("user_id", "badge_key")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_points_ledger" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "student_points_ledger" FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS deny_all_anon ON "student_points_ledger";
  CREATE POLICY deny_all_anon ON "student_points_ledger" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  ALTER TABLE "student_badges" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "student_badges" FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS deny_all_anon ON "student_badges";
  CREATE POLICY deny_all_anon ON "student_badges" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
END $$;
