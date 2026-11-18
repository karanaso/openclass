-- AlterEnum
ALTER TYPE "ResourceSource" ADD VALUE 'AI';

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "topics" JSONB,
ADD COLUMN     "topicsEdited" BOOLEAN NOT NULL DEFAULT false;
