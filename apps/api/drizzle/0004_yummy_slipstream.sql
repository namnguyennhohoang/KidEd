ALTER TABLE "artifact" ADD COLUMN "client_artifact_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_client_idx" ON "artifact" USING btree ("session_id","client_artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_idem_idx" ON "attempt" USING btree ("session_id","client_generated_id");