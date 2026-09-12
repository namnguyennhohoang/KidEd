CREATE TABLE "skill" (
	"code" text PRIMARY KEY NOT NULL,
	"group" text NOT NULL,
	"title_vi" text NOT NULL,
	"description_by_age" jsonb,
	"prerequisites" jsonb,
	"accepted_evidence_types" jsonb,
	"stage_relevance" jsonb,
	"overlays" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "skill_group_idx" ON "skill" USING btree ("group");