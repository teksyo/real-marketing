/*
  Warnings:

  - A unique constraint covering the columns `[zid]` on the table `Lead` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "zid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_zid_key" ON "Lead"("zid");
