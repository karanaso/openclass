# Tasks

## 1. Foundation

- [x] 1.1 Initialize a Next.js 15 App Router project with TypeScript, Tailwind, ESLint, and Vitest, and verify `npm run build` and `npm test` succeed.
- [x] 1.2 Add Prisma, BullMQ, ioredis, zod, jose, argon2, next-intl, framer-motion, howler, unpdf, and pino, and verify installation leaves `npm run build` green.
- [x] 1.3 Create a zod-validated environment module and `.env.example`, and verify a unit test fails fast when a required secret is missing.
- [x] 1.4 Establish `src/server`, `src/lib`, `src/worker`, and `src/app` boundaries with structured logging and typed errors, and verify lint and typecheck pass.
- [x] 1.5 Add `lint`, `typecheck`, `test`, and `build` scripts and verify all four run successfully in a clean checkout.

## 2. Data Model

- [x] 2.1 Define Prisma models for classes, lessons, pages, jobs, cards, questions, narration, videos, share links, attempts, drafts, and deck views, and verify `npx prisma validate` passes.
- [x] 2.2 Add enums, indexes, uniqueness constraints, and the initial migration, and verify `npx prisma migrate deploy` succeeds against an empty PostgreSQL database.
- [x] 2.3 Implement transactional repositories for lesson status, artifact publication, and attempt writing, and verify repository integration tests cover rollback.
- [x] 2.4 Add a Testcontainers harness for PostgreSQL and Redis, and verify the integration suite starts and tears down cleanly.
- [x] 2.5 Add an idempotent development seed with one class and one lesson stub, and verify running it twice produces one of each.

## 3. Teacher Authentication

- [x] 3.1 Implement the login page, credential verification, and signed HttpOnly session cookie, and verify success, failure, and missing-config integration tests pass.
- [x] 3.2 Guard all admin pages and admin APIs, and verify unauthenticated page requests redirect while API requests return 401.
- [x] 3.3 Implement logout, session expiry, and tampered-cookie rejection, and verify each case with integration tests.
- [x] 3.4 Add Redis-backed login throttling with lockout and counter reset, and verify threshold and reset tests pass.
- [x] 3.5 Add Origin checks for mutations plus baseline security headers, and verify a cross-origin admin mutation is rejected.
- [x] 3.6 Document password hashing and secret rotation in `docs/auth.md`, and verify the documented commands produce a working login.

## 4. Localization and App Shell

- [x] 4.1 Wire `next-intl` with `/el` and `/en` routes and locale negotiation, and verify `/` lands on Greek and `Accept-Language: en` lands on English.
- [x] 4.2 Create Greek and English message catalogs plus the shared layout, navigation, and form primitives, and verify no hardcoded user-facing strings remain in those components.
- [x] 4.3 Add locale-aware date, number, and percentage helpers, and verify their unit tests for both locales.
- [x] 4.4 Add a language switcher that persists the choice, and verify switching on admin and student surfaces keeps the current page context.
- [x] 4.5 Document the translation workflow in `docs/i18n.md`, and verify a newly added key appears in both locales without raw-key fallback.

## 5. Classes and Lessons

- [x] 5.1 Implement class create, edit, list, and reorder APIs with zod validation, and verify API tests cover empty names and invalid order payloads.
- [x] 5.2 Build the admin class list with create, rename, color, and drag-reorder, and verify a Playwright test persists the changes after reload.
- [x] 5.3 Implement class-scoped lesson listing and lesson detail queries, and verify lessons never appear under another class.
- [x] 5.4 Implement confirmed class deletion with cascade cleanup, and verify an integration test removes lessons, artifacts, attempts, share links, and stored files.
- [x] 5.5 Build the class detail and lesson detail shells showing status, usage, share links, and results entry points, and verify both pages render for an empty class.

## 6. Upload and Ingestion

- [x] 6.1 Implement the local storage adapter with put, stream, stat, and prefix delete, and verify unit tests for collision-safe keys and path traversal rejection.
- [x] 6.2 Implement multi-file multipart upload with MIME, magic-byte, size, structure, and checksum checks, and verify integration tests for accepted, rejected, and mixed batches.
- [x] 6.3 Build the upload UI with drag-and-drop, multi-file selection, folder selection, and per-file error reporting, and verify a Playwright test shows partial acceptance.
- [x] 6.4 Set up BullMQ queues and the worker bootstrap with deterministic job IDs and status transitions, and verify an integration test moves a lesson from queued to a terminal state.
- [x] 6.5 Implement authenticated SSE status streaming with polling fallback, and verify status updates appear without a page reload.
- [x] 6.6 Implement retry and cancel endpoints and controls, and verify retry re-queues a failed lesson and cancel removes a queued job.
- [x] 6.7 Implement duplicate warning and teacher confirmation, and verify the same checksum in one class triggers the warning while a different class does not.
- [x] 6.8 Implement cancellation and deletion cleanup jobs, and verify no orphaned files remain after a cancelled lesson.

## 7. AI Generation Pipeline

- [x] 7.1 Implement page-tagged PDF text extraction with `unpdf`, and verify fixtures cover a normal PDF and an image-only PDF that fails with the unsupported message.
- [x] 7.2 Define strict structured-output schemas for bilingual cards, questionnaire items, game questions, and narration, and verify each fixture validates and rejects malformed payloads.
- [x] 7.3 Build the page-grounded prompt builder with token-budget chunking and prompt versioning, and verify unit tests preserve page references across chunks.
- [x] 7.4 Implement artifact validation for schema, counts, single correct answer, duplicates, source pages, and cross-locale alignment, and verify failing cases are rejected.
- [x] 7.5 Orchestrate generation with bounded retries, atomic publication, job records, and usage totals, and verify mocked-provider integration tests cover success, retry, and permanent failure.
- [x] 7.6 Expose generation status, failure reasons, regeneration, and usage in the lesson detail UI, and verify a mocked end-to-end run publishes and then replaces artifacts.
- [x] 7.7 Add per-lesson and per-class usage summaries, and verify totals match recorded token and cost values.
- [x] 7.8 Document model, prompt, and content-limit configuration in `docs/generation.md`, and verify a fresh lesson generates with the documented defaults.

## 8. Speech and Video

- [x] 8.1 Implement per-page, per-locale TTS with duration measurement, and verify a mocked contract test writes audio and records durations.
- [x] 8.2 Implement ffmpeg slide segments, concatenation, H.264/AAC output, poster extraction, and WebVTT captions, and verify a two-page smoke test produces a seekable MP4 with captions.
- [x] 8.3 Orchestrate automatic primary-locale rendering and on-demand second-locale rendering, and verify both locale variants are exposed when complete.
- [x] 8.4 Add video status, unavailable state, and retry to the lesson detail and student tabs, and verify a failed render leaves the other modes usable.
- [x] 8.5 Enforce page, duration, size, and timeout limits with temp cleanup and disk checks, and verify an oversized lesson is skipped with a clear reason.
- [x] 8.6 Document TTS voice and video settings in `docs/media.md`, and verify changing a voice produces a new render without regenerating questions.

## 9. Student Experience

- [x] 9.1 Implement share-link creation, hashing, revocation, expiry, and class/lesson scoping, and verify revoked and expired tokens are denied.
- [x] 9.2 Build the share landing and name-entry flow with a signed student session, and verify blank names are rejected and returning browsers get the stored name.
- [x] 9.3 Build the lesson shell with Cards, Video, Game, and Questionnaire tabs, deep links, and locale switching, and verify a Playwright test keeps the tab and locale across reload.
- [x] 9.4 Implement the card deck with reveal, keyboard and touch navigation, progress, and completion tracking, and verify Playwright plus keyboard-only accessibility checks.
- [x] 9.5 Implement the questionnaire with navigation, review, draft autosave, confirmation, submission, and feedback, and verify integration tests for grading and duplicate submission.
- [x] 9.6 Implement the game with ladder progression, 50:50, ask-the-audience, animation, sound, mute persistence, reduced motion, resume, and review, and verify answer-key leakage tests pass.
- [x] 9.7 Ensure student content requests select the correct locale variant and fall back visibly, and verify a lesson missing one variant shows the fallback notice.
- [x] 9.8 Run the student journeys at phone and tablet widths, and verify no horizontal scrolling or unreachable controls in Playwright viewport tests.

## 10. Results and Analytics

- [x] 10.1 Persist questionnaire and game attempts with idempotency, retake enforcement, and normalized names, and verify integration tests for duplicate submits and retakes.
- [x] 10.2 Build the lesson results dashboard with attempt list and aggregate statistics, and verify numbers match seeded attempts.
- [x] 10.3 Add per-question correctness rates and option distributions, and verify weak items sort first.
- [x] 10.4 Build the class results overview with per-lesson and per-student averages, and verify it matches a seeded multi-lesson fixture.
- [x] 10.5 Implement CSV export for lesson and class scope, and verify the file parses with correct columns and all in-scope attempts.
- [x] 10.6 Implement attempt deletion and student result scoping, and verify students can read only their own attempt and deleted attempts leave statistics.
- [x] 10.7 Track and display deck completion, and verify reaching the last card records one view per student and lesson.

## 11. Deployment and Operations

- [ ] 11.1 Create multi-stage web and worker Docker targets with ffmpeg and Poppler, a non-root user, and no secrets baked in, and verify both images build.
- [ ] 11.2 Add Docker Compose with PostgreSQL, Redis, web, worker, healthchecks, and persistent database and media volumes, and verify `docker compose up` reaches healthy.
- [ ] 11.3 Run migrations from the entrypoint and add database, Redis, storage, and environment health checks, and verify an unhealthy dependency is reported.
- [ ] 11.4 Add backup and restore scripts plus `docs/operations.md`, and verify a restore drill into a clean environment.
- [ ] 11.5 Add a full-stack E2E smoke test with mocked AI, TTS, and ffmpeg boundaries, and verify login through student results passes in Compose.
- [ ] 11.6 Run security smoke tests for admin access, share-token isolation, answer-key leakage, upload abuse, and rate limits, and verify all pass.
- [ ] 11.7 Sanity-check concurrent uploads, SSE reconnection, and video range requests, and verify the app stays responsive during generation.
- [ ] 11.8 Document deployment configuration, resource sizing, and secret handling in `docs/deployment.md`, and verify a fresh host can follow it without missing steps.

## Workflow follow-up

- Review the implemented behavior against every spec scenario before archiving.
- Archive the change with `openspec archive add-ai-lesson-quiz-platform` after the project's review requirements are satisfied.
- Verify the archive result and that the new main specs are present under `openspec/specs/`.
