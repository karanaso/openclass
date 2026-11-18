-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('LINK', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ResourceSource" AS ENUM ('MANUAL', 'TEXT', 'ANNOTATION', 'QR');

-- CreateTable
CREATE TABLE "LessonResource" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "kind" "ResourceKind" NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'SUGGESTED',
    "source" "ResourceSource" NOT NULL DEFAULT 'MANUAL',
    "sourcePage" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "youtubeId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonResource_lessonId_fingerprint_key" ON "LessonResource"("lessonId", "fingerprint");

-- CreateIndex
CREATE INDEX "LessonResource_lessonId_position_idx" ON "LessonResource"("lessonId", "position");

-- AddForeignKey
ALTER TABLE "LessonResource" ADD CONSTRAINT "LessonResource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
