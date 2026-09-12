CREATE TABLE "ai_call_log" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text,
	"provider" text NOT NULL,
	"fell_back" boolean NOT NULL,
	"reason" text,
	"violations" jsonb,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_call_log_session_idx" ON "ai_call_log" USING btree ("session_id");