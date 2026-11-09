# Proposal

## Why

Content generation currently includes narration and validates one segment per page. A sparse page, such as a self-assessment checklist, can be omitted by the model and fail the entire lesson even when the cards, questionnaire, and game are valid. Video also starts automatically after generation through TTS and render, spending media time without teacher intent and flipping a finished lesson back to a rendering state.

This separates text content from media preparation: content generation should finish with usable lesson content, and video should start only when the teacher asks for it.

## What Changes

- **Stop generating narration inside content generation.** Content generation produces cards, questionnaire, and game only, validates those artifacts, and marks the lesson `READY`. Narration leaves the content-generation contract and retry loop.
- **Add a manual narration stage.** A teacher-triggered `NARRATION` pipeline stage ensures one narration script per page, stores both Greek and English variants, and then enqueues TTS and render for the requested locale. The stage is also used by Recreate.
- **Repair missing pages before failing.** If the first narration pass omits a page, the stage makes one targeted second request for only the missing pages. If that still leaves a page missing, only the requested locale's video variant fails; the lesson, cards, questions, other locale, and attempts stay usable.
- **Remove automatic video generation.** `processGenerate` no longer chains into TTS or render. The existing per-locale Generate/Recreate controls become the only way video work starts.
- **Keep lesson status independent of media.** Manual video work leaves the lesson `READY`; progress and failures are reported on `VideoAsset` per locale instead of changing the lesson status to `RENDERING`.
- **Clear stale narration on content regeneration.** When new content is published, old narration scripts are removed so the next video request regenerates them from the new pages.
- Update documentation and spec wording that currently describes video as automatic. Existing lessons stuck in the narration validation loop can be retried after deployment.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `lesson-generation`: narration is no longer part of the generated artifact set or the purpose of content generation.
- `content-generation`: narration normalization and validation move out of content generation; published content clears stale narration and validates only cards, questionnaire, and game.
- `video-presentation`: video generation becomes teacher-triggered, uses a narration stage before TTS, isolates narration failure to the requested variant, and keeps lesson status independent from media status.

## Impact

- `src/worker/processors/generate.ts`, `src/server/generation/orchestrator.ts`, `src/server/generation/validate.ts`, `src/server/generation/types.ts`, `src/server/repositories/publication.ts`: remove narration from content generation and publication.
- `prisma/schema.prisma`: add a `NARRATION` value to `JobStage`.
- `src/server/queue.ts`, `src/worker/index.ts`, and a new narration processor/service: add the manual narration stage and chain to TTS and render.
- `src/app/api/admin/lessons/[lessonId]/video/route.ts`: enqueue narration instead of requiring pre-existing scripts and queueing TTS directly.
- `src/worker/processors/tts.ts`, `src/worker/processors/render.ts`, `src/worker/index.ts`: stop changing lesson status for media work and treat narration failures as video-variant failures.
- `README.md`, `docs/media.md`, `docs/i18n.md`, `messages/en.json`, `messages/el.json`: update automatic-video wording and any teacher-facing guidance.
- Tests: content generation no longer expects narration, manual narration stage and targeted repair, per-variant failure isolation, lesson status stability, and route behavior.
- No new external dependency. The targeted repair adds one small provider call only when a page is missing.
