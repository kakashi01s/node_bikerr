/*
  Warnings:

  - You are about to drop the column `isGrcoup` on the `ChatRoom` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ChatRoom" DROP COLUMN "isGrcoup",
ADD COLUMN     "isGroup" BOOLEAN NOT NULL DEFAULT false;
