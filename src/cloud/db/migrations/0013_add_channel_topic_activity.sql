-- Add topic and lastActivityAt columns to channels table
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "topic" varchar(250);
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp;
