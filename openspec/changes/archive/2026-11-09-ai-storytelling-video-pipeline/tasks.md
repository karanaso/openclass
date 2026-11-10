# Tasks

## 1. Data model and configuration

- [x] 1.1 Add `LessonStory` and `StoryScene` models, `StoryStatus`, and the `STORY`, `VIDEO_SUBMIT`, `VIDEO_POLL` job stages to `prisma/schema.prisma`; add `provider`, `providerJobId`, `providerStatus`, `progress`, `contentVersion`, `idempotencyKey`, `submittedAt`, and `completedAt` to `VideoAsset`. Verify with `npx prisma validate` and `npx prisma migrate dev --name ai_storytelling_video` against a local Postgres.
- [x] 1.2 Add the `VIDEO_PROVIDER`, `VIDEO_AI_*`, `VIDEO_MAX_OUTPUT_BYTES`, `STORY_MODEL`, `STORY_MIN_SCENES`, `STORY_MAX_SCENES`, and `STORY_CHUNK_CHARS` variables to `src/lib/env.ts`, including the `superRefine` requirement that `VIDEO_AI_BASE_URL` is set when `VIDEO_PROVIDER=api`. Verify with unit tests for `api`, `mock`, and `disabled` parsing and missing-URL rejection.
- [x] 1.3 Add the new variables to `.env.example` with safe defaults/comments and verify `npm run typecheck` and the existing env tests still pass.

## 2. Story generation domain

- [x] 2.1 Add story schemas and prompt builders under `src/server/story/` (title, logline, ordered scenes, `sourcePages`, bilingual narration, optional visual direction), plus a `STORY_PROMPT_VERSION`. Verify schema tests reject empty narration, invalid page arrays, and scene counts outside the configured limits.
- [x] 2.2 Add `story(input)` to the `ContentProvider` interface and implement it in the OpenAI and mock providers, reusing the existing structured-output, usage, and cost paths. Verify provider contract tests for both implementations and that existing cards/questions tests still pass.
- [x] 2.3 Implement story normalization and validation: sort/renumber scenes, drop duplicate keys, validate page anchors against `LessonPage`, enforce substantive-page coverage, and produce a repair payload for missing or invalid material. Verify unit tests for ordering, duplicates, invalid pages, missing locales, coverage gaps, and scene limits.
- [x] 2.4 Implement `ensureLessonStory`: reuse a current `READY` story, claim generation with a conditional DB update, use the in-process in-flight map, chunk long lessons with page markers, make chunk beat drafts plus one merge pass, and allow one targeted repair. Verify unit tests for reuse, stale-version invalidation, chunked input, merge output, repair, and concurrent-claim behavior with a fake provider.
- [x] 2.5 Record `STORY` job status, model, prompt version, tokens, estimated cost, attempts, and error, and clear/invalidate the story inside `publishArtifacts` and `cancelLesson`. Verify tests that publishing new content deletes the story and does not fail when no story exists.
- [x] 2.6 Add `processStory` to the worker: upsert the requested variant as `PENDING`, prepare the story, enqueue `video-submit`, and mark only the requested locale `FAILED` on story failure. Verify processor tests for success, missing text, story failure isolation, and enqueue chaining.

## 3. Video provider adapter and lifecycle

- [x] 3.1 Define the `VideoProvider` interface and implement `HttpVideoProvider` with bearer auth, submit, status, download, request timeouts, and mapping of the proposed `POST /videos` / `GET /videos/{id}` contract. Verify adapter tests with a mocked `fetch` for success, `409` idempotency, provider failure, non-JSON errors, and timeout.
- [x] 3.2 Implement `MockVideoProvider` and bundle tiny MP4/VTT/JPG fixtures; verify `VIDEO_PROVIDER=mock` produces a completed job and ingests the fixture without network access.
- [x] 3.3 Implement `processVideoSubmit`: load the current story, build the locale request, enforce duplicate/idempotency rules, submit, persist `providerJobId`/`provider`/`contentVersion`/`submittedAt`, and enqueue the first poll. Verify tests for missing story, stale story, duplicate active job, provider failure, and successful submit.
- [x] 3.4 Implement `processVideoPoll`: map provider states to variant status/progress, stop on failure, re-enqueue with `VIDEO_AI_POLL_INTERVAL_MS`, enforce `VIDEO_AI_TIMEOUT_SECONDS`, and ignore jobs whose lesson or story version changed. Verify tests for queued, processing, completed, failed, timeout, and stale-version cases.
- [x] 3.5 Implement provider output ingestion: download to a temp directory, enforce response type, non-empty file, `VIDEO_MAX_OUTPUT_BYTES`, free-disk, and `MAX_VIDEO_SECONDS`, probe duration, store MP4/VTT/JPG under the existing per-locale keys, and mark `READY` only after all checks pass. Verify tests for success, missing captions/poster, oversized output, invalid video, and duration over limit.
- [x] 3.6 Wire the new stages into `src/server/queue.ts` and `src/worker/index.ts`, update `worker.on("failed")` so story/provider failures update only the variant (and story job), and add `resumeVideoJobs()` for startup reconciliation. Verify worker tests for stage dispatch, failure isolation, and resuming an active provider job after restart.

## 4. API, media, and UI integration

- [x] 4.1 Change `POST /api/admin/lessons/[lessonId]/video` to enqueue the `story` stage instead of `narration` and keep the existing duplicate-processing and no-pages guards. Verify route tests for first request, recreate, duplicate request, cancelled lesson, and queue failure.
- [x] 4.2 Update admin and student media routes/data to serve video, captions, and poster when the stored key exists rather than requiring `status === "READY"`, while keeping share-token/teacher authorization. Verify tests for a READY variant, a RENDERING variant with previous keys, a failed recreate with previous keys, a missing key, and an unauthorized request.
- [x] 4.3 Update `VideoVariantControls`, the admin lesson page, and the student video tab to play available media while showing provider progress/failure, omit captions/poster tracks when keys are absent, and keep Recreate disabled during processing. Verify component tests for READY, RENDERING with old media, FAILED with old media, FAILED without media, and missing caption/poster.
- [x] 4.4 Update `cancelLesson`/`deleteLesson` and storage cleanup to remove story rows and provider media, and make `removeJobsForLesson` cover the new stages. Verify service tests for cancellation/deletion cleanup and queued-job removal.

## 5. Documentation and integration verification

- [x] 5.1 Rewrite `docs/media.md` and the video sections of `docs/generation.md`/`README.md` to describe story generation, provider configuration, polling, output requirements, failure behavior, and the legacy local pipeline. Verify the documented env names match `.env.example` and `src/lib/env.ts`.
- [x] 5.2 Add or update unit and integration tests for the full story → submit → poll → ingest path with the mock provider, including both locales, story reuse, provider failure isolation, and previous-media preservation. Verify with `npm test` and `npm run test:integration`.
- [x] 5.3 Run `npm run typecheck`, `npm run lint`, and `npm test`; fix any regressions introduced by the new stages, models, or UI state. Verify all three commands exit successfully.
- [x] 5.4 With `VIDEO_PROVIDER=mock`, exercise the admin video flow end to end for both locales and one recreate, confirming the student video tab, captions, poster, and seek behavior. Verify with the existing Playwright suite plus a manual or scripted check against the local app.

## Workflow follow-up

- Review the generated planning artifacts and run `openspec validate --strict "ai-storytelling-video-pipeline"`.
- Archive the change after implementation and review are complete.
