/*
  Warnings:

  - A unique constraint covering the columns `[traccarId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "traccarId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "User_traccarId_key" ON "User"("traccarId");
