CREATE TABLE "surfboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"brand" varchar(255),
	"model" varchar(255),
	"board_type" varchar(50),
	"length_inches" numeric(5, 1),
	"width" numeric(4, 2),
	"thickness" numeric(4, 2),
	"volume" numeric(5, 1),
	"fin_setup" varchar(50),
	"tail_shape" varchar(50),
	"notes" text,
	"retired" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wetsuits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"brand" varchar(255),
	"thickness" varchar(20),
	"style" varchar(50),
	"entry" varchar(50),
	"size" varchar(10),
	"notes" text,
	"retired" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "surf_sessions" ADD COLUMN "surfboard_id" uuid;--> statement-breakpoint
ALTER TABLE "surf_sessions" ADD COLUMN "wetsuit_id" uuid;--> statement-breakpoint
ALTER TABLE "surfboards" ADD CONSTRAINT "surfboards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wetsuits" ADD CONSTRAINT "wetsuits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_surfboards_user" ON "surfboards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_wetsuits_user" ON "wetsuits" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "surf_sessions" ADD CONSTRAINT "surf_sessions_surfboard_id_surfboards_id_fk" FOREIGN KEY ("surfboard_id") REFERENCES "public"."surfboards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surf_sessions" ADD CONSTRAINT "surf_sessions_wetsuit_id_wetsuits_id_fk" FOREIGN KEY ("wetsuit_id") REFERENCES "public"."wetsuits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_surf_sessions_surfboard" ON "surf_sessions" USING btree ("surfboard_id");--> statement-breakpoint
CREATE INDEX "idx_surf_sessions_wetsuit" ON "surf_sessions" USING btree ("wetsuit_id");