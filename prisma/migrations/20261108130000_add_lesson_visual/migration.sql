-- CreateEnum
CREATE TYPE "VisualStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- AlterEnum
ALTER TYPE "JobStage" ADD VALUE 'VISUAL';

-- CreateTable
CREATE TABLE "LessonVisual" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "status" "VisualStatus" NOT NULL DEFAULT 'PENDING',
    "jobVersion" INTEGER NOT NULL DEFAULT 0,
    "sceneKey" TEXT,
    "characterSheetKey" TEXT,
    "characterLoopKey" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonVisual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonVisual_lessonId_key" ON "LessonVisual"("lessonId");

-- CreateIndex
CREATE INDEX "LessonVisual_status_idx" ON "LessonVisual"("status");

-- AddForeignKey
ALTER TABLE "LessonVisual" ADD CONSTRAINT "LessonVisual_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
