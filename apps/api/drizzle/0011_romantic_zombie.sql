ALTER TABLE "session" ADD COLUMN "timed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "time_budget_seconds" integer;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "time_spent_seconds" integer;