-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- AlterEnum
ALTER TYPE "JobStage" ADD VALUE 'STORY';
ALTER TYPE "JobStage" ADD VALUE 'VIDEO_SUBMIT';
ALTER TYPE "JobStage" ADD VALUE 'VIDEO_POLL';

-- AlterTable
ALTER TABLE "VideoAsset" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "contentVersion" INTEGER,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "progress" INTEGER,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerJobId" TEXT,
ADD COLUMN     "providerStatus" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LessonStory" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "jobVersion" INTEGER NOT NULL DEFAULT 0,
    "status" "StoryStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT,
    "logline" TEXT,
    "sourceLocale" TEXT NOT NULL DEFAULT 'el',
    "model" TEXT,
    "promptVersion" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryScene" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "sceneKey" TEXT NOT NULL,
    "sourcePages" JSONB NOT NULL,
    "narrationEl" TEXT NOT NULL,
    "narrationEn" TEXT NOT NULL,
    "visualDirection" TEXT,

    CONSTRAINT "StoryScene_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonStory_lessonId_key" ON "LessonStory"("lessonId");

-- CreateIndex
CREATE INDEX "LessonStory_status_idx" ON "LessonStory"("status");

-- CreateIndex
CREATE INDEX "StoryScene_storyId_position_idx" ON "StoryScene"("storyId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "StoryScene_storyId_sceneKey_key" ON "StoryScene"("storyId", "sceneKey");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAsset_idempotencyKey_key" ON "VideoAsset"("idempotencyKey");

-- CreateIndex
CREATE INDEX "VideoAsset_providerJobId_idx" ON "VideoAsset"("providerJobId");

-- AddForeignKey
ALTER TABLE "LessonStory" ADD CONSTRAINT "LessonStory_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryScene" ADD CONSTRAINT "StoryScene_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "LessonStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
