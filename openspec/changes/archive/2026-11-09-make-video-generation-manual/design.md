# Design

## Context

See `proposal.md` for motivation and `specs/` for behavior. The current implementation:

- `src/server/generation/orchestrator.ts` requests cards, questionnaire, game, and narration from the content provider for each page chunk, normalizes narration, validates all artifacts together, and publishes them in one transaction.
- `src/server/generation/validate.ts` requires one narration segment per supplied page. A sparse page that the model omits fails the entire generation and sends the orchestrator into its retry loop.
- `src/server/repositories/publication.ts` deletes and recreates narration rows on every content publication.
- `src/worker/processors/generate.ts` calls `generateLessonContent(..., { continueToMedia: true })`. On success the orchestrator sets the lesson `RENDERING` and enqueues `tts`; `processTts` synthesizes audio and enqueues `render`; `processRender` returns the lesson to `READY`.
- `src/app/api/admin/lessons/[lessonId]/video/route.ts` already provides the manual trigger for video variants, but it requires narration rows to exist and queues `tts` directly.
- The completed `add-video-variant-actions` change adds per-locale Generate/Recreate/Play controls and admin preview. Those controls stay; this change makes the backend honor them as the only trigger.
- `JobStage` already contains `EXTRACT`, `GENERATE`, `TTS`, `VISUAL`, and `RENDER`. `PipelineStage` mirrors the queue stages and does not yet include narration.

## Goals / Non-Goals

**Goals:**

- Make content generation independent of narration and media.
- Make video generation exclusively teacher-triggered per locale.
- Prepare narration once, reuse it for both locales, and repair missing pages without blocking content.
- Isolate narration and render failures to the affected video variant.
- Keep lesson status stable during media work.

**Non-Goals:**

- Changing the visual set, composition, or character animation behavior.
- Regenerating cards, questions, or game content when video is requested.
- Lip-sync or narration-driven animation.
- Collapsing the existing BullMQ plus orchestrator retry layers. That remains a separate reliability improvement.
- Reworking the student video tab; it already hides the video tab until a video asset exists.

## Decisions

### 1. Content generation produces text learning artifacts only

Remove narration from `RawArtifacts`, `GeneratedArtifacts`, `validateGeneratedArtifacts`, and the orchestrator's provider loop. `publishArtifacts` keeps deleting stale narration rows on a successful content publication, but no longer creates narration. The lesson becomes `READY` from the same transaction.

- **Why:** the narration failure is a media concern. Cards, questions, and game should not be discarded because one page is a checklist the model chose to skip.
- **Alternative rejected:** keeping narration in content generation behind a fallback. It would still burn narration tokens on every content attempt and keep media-shaped failures inside the content retry loop.
- **Client impact:** `ContentProvider.narration` stays on the interface for the narration stage. The mock and OpenAI providers already implement it.

### 2. Add a `NARRATION` pipeline stage before TTS

Add `NARRATION` to the Prisma `JobStage` enum and `narration` to the queue `PipelineStage` union. The worker routes `narration` to a new `processNarration` processor.

Flow:

```text
POST /video (locale)
  -> upsert VideoAsset PENDING
  -> enqueue narration(version, locale, runId)
       -> ensureLessonNarration(lessonId)
       -> enqueue tts(version, locale, runId)
            -> processTts
            -> enqueue render(version, locale, runId)
                 -> processRender
```

- **Why a separate stage:** the admin page can show a “preparing narration” state, narration retries stay separate from audio synthesis, and the video route no longer has to know whether scripts exist.
- **Alternative rejected:** generating narration inside `processTts`. It would work with less wiring, but a narration failure would be reported as a TTS failure and the processor would mix content-provider and media concerns.
- **Alternative rejected:** generating synchronously in the API request. Provider latency can be seconds to tens of seconds; the request would be fragile and leave no durable retry state.

### 3. Narration preparation is idempotent and repairs only missing pages

Add `src/server/generation/lesson-narration.ts` with `ensureLessonNarration(lessonId, options)`:

1. Load the lesson pages with non-empty text.
2. Load narration segments for the lesson.
3. A page is complete only when both `el` and `en` scripts exist. Collect incomplete pages.
4. If none are incomplete, return without a provider call.
5. Request narration for the incomplete pages only, using the existing `ContentProvider.narration`.
6. Normalize with the existing `normalizeNarration` against the requested pages.
7. If a page is still missing, make exactly one targeted second request for only those pages.
8. If a page is still missing after repair, throw `AppError("narration_incomplete", "Narration missing page N", 422, [...])`.
9. Upsert both locales for every prepared page. Existing complete rows are left untouched.
10. Record a `GenerationJob` row for `NARRATION` with model, tokens, estimated cost, attempts, and failure reason.

An in-flight map keyed by `lessonId:jobVersion` deduplicates concurrent el/en requests inside the worker process. The stage is safe to re-run because complete pages are skipped.

- **Why both locales at once:** the provider returns bilingual scripts from one call. Preparing both avoids a second provider call when the other locale is requested later.
- **Why targeted repair:** one page omission should not resend the entire lesson. The second request contains only the missing pages.
- **Why fail after repair:** a generic fallback would hide the problem and produce low-quality narration. Failing the variant gives the teacher a clear retry.

### 4. The manual API route queues narration, not TTS

`POST /api/admin/lessons/[lessonId]/video` keeps its authentication and same-origin guard, variant conflict check, and `runId` handling. It changes to:

- require the lesson to have pages, not pre-existing narration;
- upsert `VideoAsset` to `PENDING` before enqueueing so duplicate clicks see a processing variant;
- enqueue `narration` instead of `tts`;
- mark the variant `FAILED` if enqueueing fails.

The existing Generate/Recreate controls need no UI change. Recreate reuses complete scripts when present and only prepares missing pages.

### 5. Media failures stay on `VideoAsset`

The worker failure handler currently marks `tts` and `render` failures on `VideoAsset` but marks other stages as lesson failures. Add `narration` to the media branch. Narration failure after the worker's attempts marks only the requested locale's variant `FAILED` with the reason.

- **Why:** the lesson content is already valid. A missing video variant should not make the lesson look failed or block cards, game, or questionnaire.
- **Other locale:** untouched. Its `VideoAsset` row and media files are not modified.

### 6. Lesson status reflects content only

Remove media-driven lesson status updates:

- `processTts` no longer sets `RENDERING`.
- `processRender` no longer sets `READY` on success, skip, or failure.
- the worker failure handler no longer restores lesson status for media failures.

The lesson becomes `READY` when content is published and stays there while videos are prepared. `RENDERING` remains in the enum for compatibility but is no longer used by the media path.

- **Why:** the lesson is usable as soon as content exists. Video progress is already represented per locale on `VideoAsset`.
- **UI effect:** the admin page video card shows per-variant PENDING/RENDERING/READY/FAILED; the lesson badge stays READY.

### 7. Regeneration clears narration but does not prepare it

`publishArtifacts` still deletes old narration rows inside the content transaction. Because content generation no longer creates new rows, a regenerated lesson has no narration until the teacher requests a video.

- **Why:** old scripts may reference changed page text. Clearing them is safer than reusing them.
- **Trade-off:** the first video request after regeneration is slightly slower because it prepares scripts first. That cost is visible and intentional.

### 8. Recreate semantics

Recreate means “rebuild this locale's audio and video,” not “rewrite lesson content.” The narration stage reuses complete scripts; if a script is missing, it prepares only the missing pages. Cards, questions, game, and the visual set are never regenerated by a video request.

## Risks / Trade-offs

- [A sparse page still fails narration after both passes] → only that locale's video variant fails, with the page number in the error. The teacher can retry; content remains usable.
- [Two locales requested at once duplicate narration work] → an in-flight map dedupes within the worker process; complete pages are skipped on the second run. If the worker is scaled out, a database-level lock or advisory lock may be needed later.
- [Content regeneration silently removes narration] → intended: old scripts may be stale. The video card shows no ready/processing variant until the teacher requests one; the next request prepares scripts from current pages.
- [Lesson status no longer changes during long renders] → per-variant status carries the progress. The admin page already shows video status and job badges.
- [The `RENDERING` lesson status becomes unused] → keep the enum value for compatibility; a later cleanup can remove it.
- [Nested retries remain] → this change removes narration from the content retry loop, but content generation still has BullMQ plus orchestrator retries. A separate change can collapse them.
- [Existing lessons stuck in the narration loop] → after deployment, their retry runs content-only generation and succeeds. The teacher can also cancel and re-upload if desired.
- [Main spec Purpose lines still mention narration] → the delta workflow does not rewrite established Purpose sections. Update the `lesson-generation` and `content-generation` Purpose lines directly when applying if desired.

## Migration Plan

1. Add the `NARRATION` value to the `JobStage` enum with a Prisma migration.
2. Deploy the content-generation change first: content no longer requests or validates narration. Existing lessons and videos keep working.
3. Deploy the narration stage, worker routing, and API route. Existing narration rows remain valid; new video requests reuse them and prepare only missing pages.
4. Retry the affected lesson `4c3acd21-db60-4493-a9de-983bbb2a46cb` to confirm content generation finishes without narration and the lesson becomes `READY`.
5. Rollback: revert the code. The extra enum value is harmless. Existing videos and narration rows remain. Automatic video generation returns only if the old `continueToMedia` path is restored.

## Open Questions

None.
