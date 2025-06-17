/*
  Warnings:

  - You are about to drop the column `fileKey` on the `MessageAttachment` table. All the data in the column will be lost.
  - You are about to drop the column `uploadedAt` on the `MessageAttachment` table. All the data in the column will be lost.
  - Added the required column `key` to the `MessageAttachment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MessageAttachment" DROP COLUMN "fileKey",
DROP COLUMN "uploadedAt",
ADD COLUMN     "key" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Message_chatRoomId_idx" ON "Message"("chatRoomId");
