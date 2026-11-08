# Proposal

## Why

Teachers hold class material as folders of PDF lessons but have no fast way to turn that material into interactive, assessable learning experiences. This change builds a self-hosted platform where a teacher uploads lesson PDFs per class and receives, automatically, a study card deck, a bilingual quiz bank, a Millionaire-style review game, an auto-narrated video, and per-student results — all reachable through one share link, with no student accounts to manage.

## What Changes

- Add a teacher-only web application (Next.js) with password login configured through environment variables, and an admin area for classes, lessons, processing status, and results.
- Add class and lesson management: one class contains many lessons; each lesson is created from an uploaded PDF and owns all generated learning artifacts.
- Add multi-file / folder PDF upload with validation, private storage, deduplication, and a durable background processing queue with live status.
- Add an AI generation pipeline (OpenAI) that extracts PDF content, then produces:
  - a short study card deck,
  - a true/false + multiple-choice questionnaire with explanations and answer keys,
  - a separate game question set calibrated for a Millionaire-style progression,
  - narration scripts aligned to rendered PDF pages.
- Add automatic video generation: render PDF pages to images, synthesize narration with TTS, and compose a narrated MP4 per lesson.
- Add a student experience via unguessable share links: name entry (no account), then tabbed access to cards, video (when available), game, and questionnaire.
- Add a server-authoritative Millionaire-style game with animated transitions, sound effects, scoring, and lifelines.
- Add assessment capture and teacher analytics: attempts, answers, scores, completion time, and per-question difficulty.
- Add Greek/English localization across the UI and generated learning content, with Greek as the default locale.
- Add self-hosted deployment: Docker Compose for app, worker, PostgreSQL, Redis, and persistent media storage.

## Capabilities

### New Capabilities

- `teacher-auth`: Environment-configured teacher credentials, signed sessions, route protection, and login throttling.
- `class-management`: Classes as top-level containers, lesson lifecycle, ordering, archive/delete behavior, and ownership boundaries.
- `lesson-ingestion`: Browser multi-file/folder PDF upload, validation, private storage, deduplication, and queue status tracking.
- `lesson-generation`: Background extraction and OpenAI generation of cards, questionnaire items, game questions, and narration, including validation, retries, and failure reporting.
- `card-presentation`: Student-facing study card deck derived from a lesson, including navigation and locale selection.
- `quiz-game`: Millionaire-style game session with animation, sound, lifelines, server-validated answers, and scoring.
- `questionnaire`: Assessable true/false and multiple-choice questionnaire with server-side grading and feedback.
- `video-presentation`: Automatic narrated video rendering from PDF pages, availability rules, and locale variants.
- `student-experience`: Unguessable share links, name-only student entry, lesson tab navigation, and locale switching.
- `assessment-results`: Attempt persistence, scoring records, and teacher-facing per-lesson and per-question analytics.
- `localization`: Greek/English interface and generated-content localization, locale negotiation, and persistence of locale choice.

### Modified Capabilities

None — this is a greenfield project with no existing specs.

## Impact

- **New application code**: Next.js App Router app (UI + route handlers), a separate background worker, shared domain packages, database schema and migrations.
- **New infrastructure**: PostgreSQL 16, Redis-backed job queue (BullMQ), Docker Compose stack, persistent volumes for uploads and rendered media, Poppler and ffmpeg in the worker image.
- **External services**: OpenAI Chat Completions / Responses API with structured outputs for content generation and OpenAI TTS for narration; costs are incurred per lesson and per video locale.
- **Configuration**: `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `TEACHER_PASSWORD` (or hash), `AUTH_SECRET`, `STORAGE_ROOT`, `DEFAULT_LOCALE`, `APP_BASE_URL`; secrets stay server-side only.
- **Security surface**: Private PDF/media storage, unguessable share tokens, rate-limited login and student entry, server-authoritative scoring, and upload validation.
- **Operations**: Backup/restore for PostgreSQL and media volume, job retry/monitoring, storage growth from generated videos, and OpenAI spend controls.
- **Out of scope for this change**: student accounts, multi-teacher tenancy, LMS integrations, live multiplayer sessions, mobile native apps, and manual question editing UI.
