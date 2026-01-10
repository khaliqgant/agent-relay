-- Message Reactions Table
-- Stores individual reaction records (one per user per emoji per message)
-- Allows counting and listing who reacted with what

CREATE TABLE IF NOT EXISTS "message_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" uuid NOT NULL REFERENCES "channel_messages"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "emoji" varchar(20) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT "message_reactions_unique" UNIQUE("message_id", "user_id", "emoji")
);--> statement-breakpoint

-- Index for fetching all reactions on a message
CREATE INDEX IF NOT EXISTS "idx_message_reactions_message" ON "message_reactions"("message_id");--> statement-breakpoint

-- Index for fetching reactions by emoji (for "who reacted" queries)
CREATE INDEX IF NOT EXISTS "idx_message_reactions_message_emoji" ON "message_reactions"("message_id", "emoji");--> statement-breakpoint

-- Index for user's reactions (for cleanup on user deletion)
CREATE INDEX IF NOT EXISTS "idx_message_reactions_user" ON "message_reactions"("user_id");
