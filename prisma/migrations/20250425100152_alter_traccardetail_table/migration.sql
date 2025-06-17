/*
  Warnings:

  - The primary key for the `TraccarDetail` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `TraccarDetail` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[traccarId]` on the table `TraccarDetail` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `traccarId` to the `TraccarDetail` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "TraccarDetail_id_key";

-- AlterTable
ALTER TABLE "TraccarDetail" DROP CONSTRAINT "TraccarDetail_pkey",
DROP COLUMN "id",
ADD COLUMN     "traccarId" INTEGER NOT NULL,
ADD CONSTRAINT "TraccarDetail_pkey" PRIMARY KEY ("traccarId");

-- CreateIndex
CREATE UNIQUE INDEX "TraccarDetail_traccarId_key" ON "TraccarDetail"("traccarId");
