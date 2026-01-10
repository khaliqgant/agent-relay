CREATE TABLE "channel_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"member_type" varchar(20) NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"added_by_id" uuid,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channel_members_channel_member_unique" UNIQUE("channel_id","member_id","member_type")
);
--> statement-breakpoint
CREATE TABLE "channel_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"sender_type" varchar(20) NOT NULL,
	"sender_name" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"thread_id" uuid,
	"reply_count" bigint DEFAULT 0 NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"pinned_at" timestamp,
	"pinned_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_read_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_message_id" uuid,
	"last_read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channel_read_state_channel_user_unique" UNIQUE("channel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid NOT NULL,
	"member_count" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channels_workspace_name_unique" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_pinned_by_id_users_id_fk" FOREIGN KEY ("pinned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_read_state" ADD CONSTRAINT "channel_read_state_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_read_state" ADD CONSTRAINT "channel_read_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_read_state" ADD CONSTRAINT "channel_read_state_last_read_message_id_channel_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."channel_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_channel_members_channel_id" ON "channel_members" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_channel_members_member_id" ON "channel_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_channel_members_member_type" ON "channel_members" USING btree ("member_type");--> statement-breakpoint
CREATE INDEX "idx_channel_messages_channel_id" ON "channel_messages" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_channel_messages_thread_id" ON "channel_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "idx_channel_messages_created_at" ON "channel_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_messages_pinned_at" ON "channel_messages" USING btree ("pinned_at");--> statement-breakpoint
CREATE INDEX "idx_channel_messages_sender_id" ON "channel_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "idx_channel_messages_channel_created" ON "channel_messages" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_read_state_channel_id" ON "channel_read_state" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_channel_read_state_user_id" ON "channel_read_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_channels_workspace_id" ON "channels" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_channels_created_at" ON "channels" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_channels_is_archived" ON "channels" USING btree ("is_archived");