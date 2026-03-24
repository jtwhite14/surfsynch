DROP INDEX "uq_spot_shares_trio";--> statement-breakpoint
ALTER TABLE "spot_shares" ALTER COLUMN "shared_with_user_id" DROP NOT NULL;