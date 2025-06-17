/*
  Warnings:

  - You are about to drop the column `isisInviteOnly` on the `ChatRoom` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ChatRoom" DROP COLUMN "isisInviteOnly",
ADD COLUMN     "isInviteOnly" BOOLEAN NOT NULL DEFAULT false;
