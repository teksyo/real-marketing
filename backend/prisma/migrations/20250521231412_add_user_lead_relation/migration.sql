/*
  Warnings:

  - Added the required column `createdById` to the `Lead` table without a default value. This is not possible if the table is not empty.

*/
-- First, get the ID of the first admin user (or create one if none exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "User" WHERE role = 'ADMIN' LIMIT 1) THEN
        INSERT INTO "User" (email, password, role, region)
        VALUES ('admin@example.com', 'placeholder', 'ADMIN', 'ALL');
    END IF;
END $$;

-- Add the column as nullable first
ALTER TABLE "Lead" ADD COLUMN "createdById" INTEGER;

-- Update existing leads to use the first user's ID
UPDATE "Lead" 
SET "createdById" = (SELECT id FROM "User" ORDER BY id LIMIT 1)
WHERE "createdById" IS NULL;

-- Now make the column required
ALTER TABLE "Lead" ALTER COLUMN "createdById" SET NOT NULL;

-- Add the foreign key constraint
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" 
    FOREIGN KEY ("createdById") REFERENCES "User"("id") 
    ON DELETE RESTRICT ON UPDATE CASCADE;
