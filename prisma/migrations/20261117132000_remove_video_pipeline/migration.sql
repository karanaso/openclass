-- Remove retired video, story, narration, and visual pipeline data.

-- Retired pipeline stages cannot be cast to the reduced JobStage enum.
DELETE FROM "GenerationJob"
WHERE "stage" IN ('NARRATION', 'STORY', 'TTS', 'VISUAL', 'VIDEO_SUBMIT', 'VIDEO_POLL', 'RENDER');

-- Lessons that were rendering video already have their text content.
UPDATE "Lesson"
SET "status" = 'READY'
WHERE "status" = 'RENDERING';

-- Recreate LessonStatus without RENDERING.
ALTER TYPE "LessonStatus" RENAME TO "LessonStatus_old";
CREATE TYPE "LessonStatus" AS ENUM ('QUEUED', 'EXTRACTING', 'GENERATING', 'READY', 'FAILED', 'CANCELLED');
ALTER TABLE "Lesson" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Lesson" ALTER COLUMN "status" TYPE "LessonStatus" USING ("status"::text::"LessonStatus");
ALTER TABLE "Lesson" ALTER COLUMN "status" SET DEFAULT 'QUEUED';
DROP TYPE "LessonStatus_old";

-- Recreate JobStage with only extraction and content generation.
ALTER TYPE "JobStage" RENAME TO "JobStage_old";
CREATE TYPE "JobStage" AS ENUM ('EXTRACT', 'GENERATE');
ALTER TABLE "GenerationJob" ALTER COLUMN "stage" TYPE "JobStage" USING ("stage"::text::"JobStage");
DROP TYPE "JobStage_old";

-- Remove page rasterization metadata.
ALTER TABLE "LessonPage" DROP COLUMN "imageKey";

-- Drop video, story, narration, and visual storage.
DROP TABLE "StoryScene";
DROP TABLE "LessonStory";
DROP TABLE "NarrationSegment";
DROP TABLE "VideoAsset";
DROP TABLE "LessonVisual";

-- Drop enums that only those tables used.
DROP TYPE "StoryStatus";
DROP TYPE "VideoStatus";
DROP TYPE "VisualStatus";
