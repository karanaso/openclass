-- AlterTable
ALTER TABLE "LessonVisual"
    ADD COLUMN "generationId" TEXT,
    ADD COLUMN "artBrief" TEXT,
    ADD COLUMN "artBriefModel" TEXT,
    ADD COLUMN "artBriefFallback" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "imageQuality" TEXT,
    ADD COLUMN "lastError" TEXT;
