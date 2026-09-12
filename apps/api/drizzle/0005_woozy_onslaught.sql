CREATE TABLE "child_assent" (
	"id" text PRIMARY KEY NOT NULL,
	"child_profile_id" text NOT NULL,
	"type" text NOT NULL,
	"given" boolean NOT NULL,
	"method" text NOT NULL,
	"recorded_by_user_id" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "child_assent" ADD CONSTRAINT "child_assent_child_profile_id_child_profile_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_assent" ADD CONSTRAINT "child_assent_recorded_by_user_id_app_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "child_assent_child_idx" ON "child_assent" USING btree ("child_profile_id");