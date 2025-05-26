/*
  Warnings:

  - You are about to drop the column `createdById` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `region` on the `Lead` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_createdById_fkey";

-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "createdById",
DROP COLUMN "region";

-- AlterTable
ALTER TABLE "_ContactToLead" ADD CONSTRAINT "_ContactToLead_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_ContactToLead_AB_unique";
