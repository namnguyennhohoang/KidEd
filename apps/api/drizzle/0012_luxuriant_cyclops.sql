CREATE TABLE "exploration_cycle" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"child_profile_id" text NOT NULL,
	"title" text NOT NULL,
	"domains" jsonb NOT NULL,
	"planned_weeks" integer NOT NULL,
	"started_on" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"reflection_note" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "interest_signal" (
	"id" text PRIMARY KEY NOT NULL,
	"child_profile_id" text NOT NULL,
	"cycle_id" text,
	"domain" text NOT NULL,
	"source" text NOT NULL,
	"strength" text NOT NULL,
	"note" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exploration_cycle" ADD CONSTRAINT "exploration_cycle_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exploration_cycle" ADD CONSTRAINT "exploration_cycle_child_profile_id_child_profile_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_signal" ADD CONSTRAINT "interest_signal_child_profile_id_child_profile_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_signal" ADD CONSTRAINT "interest_signal_cycle_id_exploration_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."exploration_cycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exploration_cycle_child_idx" ON "exploration_cycle" USING btree ("child_profile_id");--> statement-breakpoint
CREATE INDEX "interest_signal_child_idx" ON "interest_signal" USING btree ("child_profile_id");--> statement-breakpoint
CREATE INDEX "interest_signal_domain_idx" ON "interest_signal" USING btree ("child_profile_id","domain");