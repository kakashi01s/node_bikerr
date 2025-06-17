/*
  Warnings:

  - You are about to drop the column `isGroup` on the `ChatRoom` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ChatRoom" DROP COLUMN "isGroup",
ADD COLUMN     "city" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isGrcoup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "state" TEXT;
