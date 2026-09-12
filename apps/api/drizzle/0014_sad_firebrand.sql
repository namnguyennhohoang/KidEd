CREATE TABLE "project_contribution" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"child_profile_id" text NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"ai_assistance_level" text DEFAULT 'NONE' NOT NULL,
	"ai_assistance_note" text,
	"hours_spent" integer,
	"artifact_id" text,
	"occurred_on" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scholar_project" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"child_profile_id" text NOT NULL,
	"title" text NOT NULL,
	"driving_question" text NOT NULL,
	"pathway" text DEFAULT 'UNDECIDED' NOT NULL,
	"disciplines" jsonb NOT NULL,
	"target_months" integer NOT NULL,
	"started_on" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"reflection_note" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "project_contribution" ADD CONSTRAINT "project_contribution_project_id_scholar_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."scholar_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contribution" ADD CONSTRAINT "project_contribution_child_profile_id_child_profile_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contribution" ADD CONSTRAINT "project_contribution_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholar_project" ADD CONSTRAINT "scholar_project_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholar_project" ADD CONSTRAINT "scholar_project_child_profile_id_child_profile_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_contribution_project_idx" ON "project_contribution" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "scholar_project_child_idx" ON "scholar_project" USING btree ("child_profile_id");