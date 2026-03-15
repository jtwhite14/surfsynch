CREATE TABLE "session_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"photo_url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spot_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"forecast_hour" timestamp NOT NULL,
	"time_window" varchar(20) NOT NULL,
	"match_score" numeric(5, 2) NOT NULL,
	"confidence_score" numeric(5, 2) NOT NULL,
	"effective_score" numeric(5, 2) NOT NULL,
	"matched_session_id" uuid NOT NULL,
	"match_details" jsonb NOT NULL,
	"forecast_snapshot" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_conditions" ADD COLUMN "tide_height" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "surf_spots" ADD COLUMN "condition_weights" jsonb;--> statement-breakpoint
ALTER TABLE "session_photos" ADD CONSTRAINT "session_photos_session_id_surf_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."surf_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_alerts" ADD CONSTRAINT "spot_alerts_spot_id_surf_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."surf_spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_alerts" ADD CONSTRAINT "spot_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_alerts" ADD CONSTRAINT "spot_alerts_matched_session_id_surf_sessions_id_fk" FOREIGN KEY ("matched_session_id") REFERENCES "public"."surf_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_spot_alerts_active" ON "spot_alerts" USING btree ("spot_id","user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_spot_alerts_dedup" ON "spot_alerts" USING btree ("spot_id","user_id","forecast_hour","time_window");--> statement-breakpoint
CREATE INDEX "idx_surf_sessions_spot_rating" ON "spot_alerts" USING btree ("spot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_spot_forecasts_spot" ON "spot_forecasts" USING btree ("spot_id");