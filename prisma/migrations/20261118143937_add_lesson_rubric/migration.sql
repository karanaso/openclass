-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "rubric" JSONB,
ADD COLUMN     "rubricEdited" BOOLEAN NOT NULL DEFAULT false;
