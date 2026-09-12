CREATE TABLE "specialisation_choice" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"child_profile_id" text NOT NULL,
	"primary_subject" text NOT NULL,
	"backup_subject" text NOT NULL,
	"rationale" text NOT NULL,
	"based_on_cycle_id" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"superseded_by_id" text,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "specialisation_choice" ADD CONSTRAINT "specialisation_choice_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialisation_choice" ADD CONSTRAINT "specialisation_choice_child_profile_id_child_profile_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialisation_choice" ADD CONSTRAINT "specialisation_choice_based_on_cycle_id_exploration_cycle_id_fk" FOREIGN KEY ("based_on_cycle_id") REFERENCES "public"."exploration_cycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "specialisation_choice_child_idx" ON "specialisation_choice" USING btree ("child_profile_id");