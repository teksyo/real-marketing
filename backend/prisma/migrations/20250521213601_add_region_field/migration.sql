/*
  Warnings:

  - Added the required column `region` to the `Lead` table without a default value. This is not possible if the table is not empty.

*/
-- First add the column as nullable
ALTER TABLE "Lead" ADD COLUMN "region" TEXT;

-- Set default value for existing records
UPDATE "Lead" SET "region" = 'Unknown';

-- Make the column required
ALTER TABLE "Lead" ALTER COLUMN "region" SET NOT NULL;
