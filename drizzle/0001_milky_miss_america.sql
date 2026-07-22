ALTER TABLE "profiles" ADD COLUMN "email" varchar(255);--> statement-breakpoint
CREATE INDEX "profiles_email_idx" ON "profiles" USING btree ("email");