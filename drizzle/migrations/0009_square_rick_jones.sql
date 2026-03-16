CREATE TABLE "condition_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"target_swell_height" numeric(5, 2),
	"target_swell_period" numeric(5, 2),
	"target_swell_direction" numeric(5, 2),
	"target_wind_speed" numeric(5, 2),
	"target_wind_direction" numeric(5, 2),
	"target_tide_height" numeric(6, 3),
	"active_months" jsonb,
	"reinforcement_count" integer DEFAULT 0 NOT NULL,
	"last_reinforced_at" timestamp,
	"source" varchar(20) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spot_alerts" ALTER COLUMN "matched_session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "spot_alerts" ADD COLUMN "matched_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "condition_profiles" ADD CONSTRAINT "condition_profiles_spot_id_surf_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."surf_spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_profiles" ADD CONSTRAINT "condition_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_condition_profiles_spot_active" ON "condition_profiles" USING btree ("spot_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_condition_profiles_user" ON "condition_profiles" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "spot_alerts" ADD CONSTRAINT "spot_alerts_matched_profile_id_condition_profiles_id_fk" FOREIGN KEY ("matched_profile_id") REFERENCES "public"."condition_profiles"("id") ON DELETE set null ON UPDATE no action;