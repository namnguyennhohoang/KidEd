CREATE TABLE "content_import_job" (
	"id" text PRIMARY KEY NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"family_id" text,
	"format" text NOT NULL,
	"status" text DEFAULT 'DONE' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"valid_count" integer DEFAULT 0 NOT NULL,
	"created_pack_ids" jsonb,
	"error_report" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_review" (
	"id" text PRIMARY KEY NOT NULL,
	"pack_id" text NOT NULL,
	"reviewer_user_id" text NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"self_review" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_pack" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "content_pack" ADD COLUMN "origin" text DEFAULT 'REFERENCE' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_pack" ADD COLUMN "family_id" text;--> statement-breakpoint
ALTER TABLE "content_pack" ADD COLUMN "ai_generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "content_pack" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "content_pack" ADD COLUMN "submitted_by_user_id" text;--> statement-breakpoint
ALTER TABLE "content_pack" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_pack" ADD COLUMN "reviewed_by_user_id" text;--> statement-breakpoint
ALTER TABLE "content_pack" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "content_pack" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_import_job" ADD CONSTRAINT "content_import_job_uploaded_by_user_id_app_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_import_job" ADD CONSTRAINT "content_import_job_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_review" ADD CONSTRAINT "content_review_pack_id_content_pack_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."content_pack"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_review" ADD CONSTRAINT "content_review_reviewer_user_id_app_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pack" ADD CONSTRAINT "content_pack_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_pack_code_idx" ON "content_pack" USING btree ("code");--> statement-breakpoint
CREATE INDEX "content_pack_family_idx" ON "content_pack" USING btree ("family_id");