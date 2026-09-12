CREATE TABLE "data_request" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"scope" jsonb,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"result_key" text,
	"error" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "parent_observation" (
	"id" text PRIMARY KEY NOT NULL,
	"child_profile_id" text NOT NULL,
	"session_id" text,
	"author_user_id" text NOT NULL,
	"text" text NOT NULL,
	"tags" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"child_profile_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"session_id" text,
	"artifact_id" text,
	"source" text NOT NULL,
	"strength" text NOT NULL,
	"confidence" text NOT NULL,
	"verifier" text NOT NULL,
	"recency_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_request" ADD CONSTRAINT "data_request_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_request" ADD CONSTRAINT "data_request_requested_by_user_id_app_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_observation" ADD CONSTRAINT "parent_observation_child_profile_id_child_profile_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_observation" ADD CONSTRAINT "parent_observation_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_observation" ADD CONSTRAINT "parent_observation_author_user_id_app_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_child_profile_id_child_profile_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parent_observation_child_idx" ON "parent_observation" USING btree ("child_profile_id");--> statement-breakpoint
CREATE INDEX "skill_evidence_child_idx" ON "skill_evidence" USING btree ("child_profile_id");--> statement-breakpoint
CREATE INDEX "skill_evidence_skill_idx" ON "skill_evidence" USING btree ("skill_id");