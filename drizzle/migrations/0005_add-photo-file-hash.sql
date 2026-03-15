ALTER TABLE "session_photos" ADD COLUMN "file_hash" text;--> statement-breakpoint
ALTER TABLE "upload_photos" ADD COLUMN "file_hash" text;--> statement-breakpoint
ALTER TABLE "upload_photos" ADD COLUMN "is_duplicate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_photos" ADD COLUMN "existing_session_id" uuid;--> statement-breakpoint
ALTER TABLE "upload_photos" ADD COLUMN "existing_session_date" timestamp;--> statement-breakpoint
CREATE INDEX "idx_session_photos_file_hash" ON "session_photos" USING btree ("file_hash");
