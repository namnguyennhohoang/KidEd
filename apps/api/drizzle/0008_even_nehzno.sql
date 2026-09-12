CREATE TABLE "admission_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text,
	"target_overlay_id" text,
	"institution_code" text NOT NULL,
	"institution_name" text NOT NULL,
	"admission_year" integer NOT NULL,
	"effective_date" timestamp with time zone,
	"source_url" text,
	"source_checked_date" timestamp with time zone,
	"review_by_date" timestamp with time zone,
	"eligibility" jsonb,
	"exam_or_portfolio_structure" jsonb,
	"subjects" jsonb,
	"duration_info" jsonb,
	"scoring_method" jsonb,
	"cutoff" jsonb,
	"notes" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"superseded_by_id" text,
	"verified_by_user_id" text,
	"verified_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_overlay" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admission_rule" ADD CONSTRAINT "admission_rule_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_rule" ADD CONSTRAINT "admission_rule_target_overlay_id_target_overlay_id_fk" FOREIGN KEY ("target_overlay_id") REFERENCES "public"."target_overlay"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admission_rule_family_idx" ON "admission_rule" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "admission_rule_inst_idx" ON "admission_rule" USING btree ("institution_code","admission_year");