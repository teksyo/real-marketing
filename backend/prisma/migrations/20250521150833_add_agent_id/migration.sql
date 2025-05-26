/*
  Warnings:

  - You are about to drop the column `phoneNumber` on the `Lead` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('AGENT', 'BROKER');

-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "phoneNumber";

-- CreateTable
CREATE TABLE "Contact" (
    "id" SERIAL NOT NULL,
    "agentId" TEXT,
    "name" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "type" "ContactType" NOT NULL,
    "licenseNo" TEXT,
    "company" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ContactToLead" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_agentId_key" ON "Contact"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "_ContactToLead_AB_unique" ON "_ContactToLead"("A", "B");

-- CreateIndex
CREATE INDEX "_ContactToLead_B_index" ON "_ContactToLead"("B");

-- AddForeignKey
ALTER TABLE "_ContactToLead" ADD CONSTRAINT "_ContactToLead_A_fkey" FOREIGN KEY ("A") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContactToLead" ADD CONSTRAINT "_ContactToLead_B_fkey" FOREIGN KEY ("B") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
