CREATE TABLE "content_pack" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'CONTENT_PACK' NOT NULL,
	"schema_version" text NOT NULL,
	"content_version" text NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"locale" text NOT NULL,
	"stage" text NOT NULL,
	"grades" jsonb NOT NULL,
	"target_overlays" jsonb,
	"provenance_author" text NOT NULL,
	"provenance_reviewer" text,
	"provenance_source_refs" jsonb,
	"license" text NOT NULL,
	"superseded_by" text,
	"source_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_unit" (
	"id" text PRIMARY KEY NOT NULL,
	"pack_id" text NOT NULL,
	"title" text NOT NULL,
	"locale" text NOT NULL,
	"stage" text NOT NULL,
	"status" text NOT NULL,
	"schema_version" text NOT NULL,
	"content_version" text NOT NULL,
	"grades" jsonb NOT NULL,
	"domains" jsonb NOT NULL,
	"duration_screen_min" integer NOT NULL,
	"duration_offline_min" integer NOT NULL,
	"materials" jsonb,
	"choices" jsonb NOT NULL,
	"quest_flow" jsonb NOT NULL,
	"hints" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"rubric_id" text,
	"adaptations" jsonb,
	"safety_adult_required" boolean DEFAULT false NOT NULL,
	"safety_risk_level" text DEFAULT 'LOW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_unit_outcome" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"framework" text NOT NULL,
	"code" text,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_unit_skill" (
	"unit_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "learning_unit_skill_unit_id_skill_id_pk" PRIMARY KEY("unit_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "learning_unit" ADD CONSTRAINT "learning_unit_pack_id_content_pack_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."content_pack"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_unit_outcome" ADD CONSTRAINT "learning_unit_outcome_unit_id_learning_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."learning_unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_unit_skill" ADD CONSTRAINT "learning_unit_skill_unit_id_learning_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."learning_unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_unit_pack_idx" ON "learning_unit" USING btree ("pack_id");--> statement-breakpoint
CREATE INDEX "learning_unit_stage_idx" ON "learning_unit" USING btree ("stage");