-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_createdById_fkey";

-- AlterTable
ALTER TABLE "Lead" ALTER COLUMN "createdById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
