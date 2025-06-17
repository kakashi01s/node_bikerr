/*
  Warnings:

  - Added the required column `traccarToken` to the `TraccarDetail` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TraccarDetail" ADD COLUMN     "traccarToken" TEXT NOT NULL;
