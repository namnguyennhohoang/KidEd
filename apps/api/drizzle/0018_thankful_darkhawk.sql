CREATE TABLE "educator_share" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"child_profile_id" text NOT NULL,
	"role" text NOT NULL,
	"scope" jsonb NOT NULL,
	"label" text,
	"mode" text NOT NULL,
	"token_hash" text,
	"invite_email" text,
	"invite_code_hash" text,
	"educator_user_id" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "educator_share" ADD CONSTRAINT "educator_share_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "educator_share" ADD CONSTRAINT "educator_share_child_profile_id_child_profile_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "educator_share" ADD CONSTRAINT "educator_share_educator_user_id_app_user_id_fk" FOREIGN KEY ("educator_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "educator_share_child_idx" ON "educator_share" USING btree ("child_profile_id");--> statement-breakpoint
CREATE INDEX "educator_share_token_idx" ON "educator_share" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "educator_share_educator_idx" ON "educator_share" USING btree ("educator_user_id");