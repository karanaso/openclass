-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('QUEUED', 'EXTRACTING', 'GENERATING', 'RENDERING', 'READY', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobStage" AS ENUM ('EXTRACT', 'GENERATE', 'TTS', 'RENDER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "QuestionMode" AS ENUM ('QUESTIONNAIRE', 'GAME');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TRUE_FALSE', 'MULTIPLE_CHOICE');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('PENDING', 'RENDERING', 'READY', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AttemptMode" AS ENUM ('QUESTIONNAIRE', 'GAME');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ENDED');

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "sourceLocale" TEXT NOT NULL DEFAULT 'el',
    "status" "LessonStatus" NOT NULL DEFAULT 'QUEUED',
    "failureReason" TEXT,
    "retakeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "passThreshold" INTEGER NOT NULL DEFAULT 60,
    "jobVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processingStartedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPage" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "imageKey" TEXT,

    CONSTRAINT "LessonPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "stage" "JobStage" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT,
    "promptVersion" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "sourcePage" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardTranslation" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "answer" TEXT NOT NULL,

    CONSTRAINT "CardTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "mode" "QuestionMode" NOT NULL,
    "itemKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "correctOptionId" TEXT NOT NULL,
    "sourcePage" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionTranslation" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,

    CONSTRAINT "QuestionTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NarrationSegment" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "audioKey" TEXT,
    "durationMs" INTEGER,

    CONSTRAINT "NarrationSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAsset" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "status" "VideoStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT,
    "captionsKey" TEXT,
    "posterKey" TEXT,
    "durationMs" INTEGER,
    "sizeBytes" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "classId" TEXT,
    "lessonId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3),

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "normalizedStudentName" TEXT NOT NULL,
    "mode" "AttemptMode" NOT NULL,
    "locale" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "maxScore" INTEGER NOT NULL DEFAULT 0,
    "percentage" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "reachedLevel" INTEGER,
    "gameStatus" "GameStatus",
    "sessionTokenHash" TEXT,
    "questionOrder" JSONB,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "lifelines" JSONB,
    "idempotencyKey" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptDraft" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "normalizedStudentName" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttemptDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckView" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "normalizedStudentName" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeckView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Class_position_idx" ON "Class"("position");

-- CreateIndex
CREATE INDEX "Lesson_classId_createdAt_idx" ON "Lesson"("classId", "createdAt");

-- CreateIndex
CREATE INDEX "Lesson_classId_checksum_idx" ON "Lesson"("classId", "checksum");

-- CreateIndex
CREATE INDEX "Lesson_status_idx" ON "Lesson"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LessonPage_lessonId_pageNumber_key" ON "LessonPage"("lessonId", "pageNumber");

-- CreateIndex
CREATE INDEX "GenerationJob_lessonId_createdAt_idx" ON "GenerationJob"("lessonId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_status_idx" ON "GenerationJob"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_lessonId_stage_key" ON "GenerationJob"("lessonId", "stage");

-- CreateIndex
CREATE INDEX "Card_lessonId_position_idx" ON "Card"("lessonId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Card_lessonId_itemKey_key" ON "Card"("lessonId", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "CardTranslation_cardId_locale_key" ON "CardTranslation"("cardId", "locale");

-- CreateIndex
CREATE INDEX "Question_lessonId_mode_position_idx" ON "Question"("lessonId", "mode", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Question_lessonId_mode_itemKey_key" ON "Question"("lessonId", "mode", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionTranslation_questionId_locale_key" ON "QuestionTranslation"("questionId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "NarrationSegment_lessonId_pageNumber_locale_key" ON "NarrationSegment"("lessonId", "pageNumber", "locale");

-- CreateIndex
CREATE INDEX "VideoAsset_lessonId_status_idx" ON "VideoAsset"("lessonId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAsset_lessonId_locale_key" ON "VideoAsset"("lessonId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ShareLink_classId_idx" ON "ShareLink"("classId");

-- CreateIndex
CREATE INDEX "ShareLink_lessonId_idx" ON "ShareLink"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_sessionTokenHash_key" ON "Attempt"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "Attempt_lessonId_normalizedStudentName_mode_idx" ON "Attempt"("lessonId", "normalizedStudentName", "mode");

-- CreateIndex
CREATE INDEX "Attempt_lessonId_completedAt_idx" ON "Attempt"("lessonId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_lessonId_idempotencyKey_key" ON "Attempt"("lessonId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptAnswer_attemptId_questionId_key" ON "AttemptAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptDraft_lessonId_normalizedStudentName_key" ON "AttemptDraft"("lessonId", "normalizedStudentName");

-- CreateIndex
CREATE UNIQUE INDEX "DeckView_lessonId_normalizedStudentName_key" ON "DeckView"("lessonId", "normalizedStudentName");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPage" ADD CONSTRAINT "LessonPage_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardTranslation" ADD CONSTRAINT "CardTranslation_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTranslation" ADD CONSTRAINT "QuestionTranslation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NarrationSegment" ADD CONSTRAINT "NarrationSegment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptDraft" ADD CONSTRAINT "AttemptDraft_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckView" ADD CONSTRAINT "DeckView_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
