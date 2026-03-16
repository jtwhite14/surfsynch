ALTER TABLE "condition_profiles" ADD COLUMN "consistency" varchar(10) NOT NULL DEFAULT 'medium';
ALTER TABLE "condition_profiles" ADD COLUMN "quality_ceiling" integer NOT NULL DEFAULT 3;
