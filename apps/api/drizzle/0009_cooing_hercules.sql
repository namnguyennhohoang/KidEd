CREATE TABLE "attempt_error" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text,
	"session_id" text NOT NULL,
	"child_profile_id" text NOT NULL,
	"skill_id" text,
	"cause" text NOT NULL,
	"note" text,
	"classified_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempt_error" ADD CONSTRAINT "attempt_error_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_error" ADD CONSTRAINT "attempt_error_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_error" ADD CONSTRAINT "attempt_error_child_profile_id_child_profile_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_error_child_idx" ON "attempt_error" USING btree ("child_profile_id");--> statement-breakpoint
CREATE INDEX "attempt_error_skill_idx" ON "attempt_error" USING btree ("skill_id");