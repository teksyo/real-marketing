-- This is an empty migration.

-- Drop the createdById column if it exists
ALTER TABLE "Lead" DROP COLUMN IF EXISTS "createdById";