CREATE TABLE "condition_history_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"scores" jsonb NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "condition_history_cache" ADD CONSTRAINT "condition_history_cache_spot_id_surf_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."surf_spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_history_cache" ADD CONSTRAINT "condition_history_cache_session_id_surf_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."surf_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "condition_history_cache_spot_session_idx" ON "condition_history_cache" USING btree ("spot_id","session_id");