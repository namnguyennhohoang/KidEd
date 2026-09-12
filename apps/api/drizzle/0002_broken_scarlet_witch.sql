CREATE TABLE "artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"child_profile_id" text NOT NULL,
	"type" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"transcript_text" text,
	"transcript_is_verbatim" boolean DEFAULT true NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"parent_visible" boolean DEFAULT true NOT NULL,
	"share_scope" text DEFAULT 'PRIVATE' NOT NULL,
	"ai_assistance_level" text DEFAULT 'NONE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact_version" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"version" integer NOT NULL,
	"storage_key" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"content" jsonb,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_generated_id" text
);
--> statement-breakpoint
CREATE TABLE "hint_interaction" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"help_ladder_level" integer NOT NULL,
	"max_allowed_level" integer NOT NULL,
	"intent" text NOT NULL,
	"child_message" text NOT NULL,
	"coach_provider" text DEFAULT 'deterministic' NOT NULL,
	"invariant_violations" jsonb,
	"shown_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reflection" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"prompt" text NOT NULL,
	"response_type" text NOT NULL,
	"response_text" text,
	"response_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_firing" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"rule_version" text NOT NULL,
	"child_profile_id" text,
	"session_id" text,
	"parent_explanation" text NOT NULL,
	"decision" text NOT NULL,
	"inputs_used" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"child_profile_id" text NOT NULL,
	"learning_unit_id" text NOT NULL,
	"stage" text NOT NULL,
	"status" text DEFAULT 'STARTED' NOT NULL,
	"plan" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_action_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_offline" boolean DEFAULT false NOT NULL,
	"client_generated_id" text NOT NULL,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session_event" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"client_generated_id" text NOT NULL,
	"source" text DEFAULT 'CHILD_APP' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_child_profile_id_child_profile_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hint_interaction" ADD CONSTRAINT "hint_interaction_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflection" ADD CONSTRAINT "reflection_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_firing" ADD CONSTRAINT "rule_firing_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_child_profile_id_child_profile_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_learning_unit_id_learning_unit_id_fk" FOREIGN KEY ("learning_unit_id") REFERENCES "public"."learning_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_event" ADD CONSTRAINT "session_event_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_session_idx" ON "artifact" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "attempt_session_idx" ON "attempt" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "hint_interaction_session_idx" ON "hint_interaction" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_cgid_idx" ON "session" USING btree ("client_generated_id");--> statement-breakpoint
CREATE INDEX "session_child_idx" ON "session" USING btree ("child_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_event_idem_idx" ON "session_event" USING btree ("session_id","client_generated_id");