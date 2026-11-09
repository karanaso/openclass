# Tasks

## 1. Data model and queue scaffolding

- [x] 1.1 Add `NARRATION` to the Prisma `JobStage` enum and create the migration; verify with `npx prisma validate` and `npx prisma generate`.
- [x] 1.2 Add `narration` to the queue `PipelineStage` union and confirm job ids distinguish `narration` from `tts`; verify with `tests/queue-job-id.test.ts`.

## 2. Content generation becomes content-only

- [x] 2.1 Remove narration from `RawArtifacts`, `GeneratedArtifacts`, `validateGeneratedArtifacts`, and the orchestrator provider loop; verify `tests/generation.test.ts` and a new case where a page with no narration still publishes cards, questionnaire, and game.
- [x] 2.2 Change `publishArtifacts` to delete stale narration rows without creating new ones; verify with an integration test that content regeneration clears old narration while publishing the new text artifacts.
- [x] 2.3 Remove `continueToMedia` from the generate path and stop enqueueing TTS after content generation; verify that a completed generation leaves the lesson `READY` and queues no `tts` or `render` job.

## 3. Narration preparation service

- [x] 3.1 Add `ensureLessonNarration` with existing-script reuse, both-locale upserts, normalization, one targeted repair pass for missing pages, and a detailed `narration_incomplete` error; verify with unit tests for reuse, duplicate normalization, out-of-scope segments, and repair.
- [x] 3.2 Add an in-flight dedupe keyed by lesson and job version so concurrent Greek and English requests do not duplicate provider calls; verify with a concurrent-request test and repeated idempotent runs.
- [x] 3.3 Record the `NARRATION` generation job with model, tokens, cost, attempts, and failure reason; verify with an integration test that the job row is `COMPLETED` or `FAILED` with the expected metadata.
- [x] 3.4 Add integration coverage for both locales being stored from one provider call, reuse on a second locale, and a missing page that still fails after repair.

## 4. NARRATION stage and worker

- [x] 4.1 Implement `processNarration` to mark the requested `VideoAsset` `PENDING`, call `ensureLessonNarration`, and enqueue `tts` with the same version, locale, and run id; verify with an integration test that the chain reaches TTS.
- [x] 4.2 Route `narration` in the worker and add it to the media-failure branch so a final failure marks only the requested variant `FAILED`; verify the lesson stays `READY` and the other locale is untouched.
- [x] 4.3 Verify Recreate reuses complete scripts without calling the narration provider, while Generate prepares missing scripts; cover both with integration assertions on provider call counts.

## 5. API route and lesson status

- [x] 5.1 Update `POST /api/admin/lessons/[lessonId]/video` to require pages rather than pre-existing narration, set the variant `PENDING`, enqueue `narration`, and mark the variant `FAILED` if enqueueing fails; verify route tests for success, conflict, cancellation, and authentication.
- [x] 5.2 Remove lesson status changes from `processTts`, `processRender`, and the worker media-failure path; verify the lesson remains `READY` while a variant is pending, rendering, ready, or failed.
- [x] 5.3 Add an integration assertion that content generation produces a ready lesson with no video asset, and that clicking Generate creates and completes a variant without changing content rows.

## 6. Documentation and operator copy

- [x] 6.1 Update `README.md`, `docs/media.md`, and `docs/i18n.md` to say that video is teacher-triggered and narration is prepared on demand; verify the documented flow matches the route and stage names.
- [x] 6.2 Update teacher-facing copy for the video `PENDING` state and the Generate action so “preparing narration” is understandable; verify with `tests/messages.test.ts` and `tests/video-variant-controls.test.tsx`.
- [x] 6.3 Update `docs/generation.md` to remove narration from content generation and describe the `NARRATION` stage, targeted repair, and failure isolation; verify the documented behavior matches the specs.

## 7. Verification

- [x] 7.1 Run `npm test`, `npm run typecheck`, and `npm run lint`; verify all pass.
- [x] 7.2 Run the generation, media, and security integration suites; verify content-only generation, manual narration, video failure isolation, and route authorization.
- [x] 7.3 Run the admin end-to-end path: content generation finishes `READY` with no video, Generate prepares narration and produces the variant, and a still-missing page fails only that variant.
- [x] 7.4 Retry the affected lesson `4c3acd21-db60-4493-a9de-983bbb2a46cb` in a development environment and confirm it reaches `READY` without narration blocking content.

## Workflow follow-up

- Archive the change after review and spec sync.
- Consider a separate change to collapse the BullMQ and orchestrator retry layers.
