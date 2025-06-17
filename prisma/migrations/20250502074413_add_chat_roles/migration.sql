-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER');

-- AlterTable
ALTER TABLE "ChatRoomUser" ADD COLUMN     "role" "ChatRole" NOT NULL DEFAULT 'MEMBER';
