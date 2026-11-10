# Proposal

## Why

The current video pipeline asks a text model for one narration paragraph per PDF page, synthesizes each paragraph with TTS, and composes the pages into a slideshow with a locally generated character. That produces a read-aloud slide deck, not a story, and it locks video quality to the local ffmpeg composition. Moving the creative work to a storytelling agent and the rendering work to a dedicated AI video server gives the lesson a coherent narrative, offloads heavy rendering, and lets the video improve without changing LessonLab's extraction or content generation.

## What Changes

- **Add a storytelling stage.** After PDF text extraction, a text agent receives the lesson title and page-tagged source text and writes one continuous, bilingual story with ordered scenes, each anchored to valid source pages. Long PDFs are handled with chunked drafting and a single merge pass.
- **Replace TTS and local rendering with a video-provider adapter.** A new provider submits the story and locale to a configurable AI video server, polls the provider job, downloads the finished MP4, and ingests its captions and poster. LessonLab no longer runs TTS or ffmpeg slide composition for the video path.
- **Keep video generation teacher-triggered and per-locale.** The existing Generate/Recreate controls start, respectively resume, story preparation and provider submission for one locale. Completing content generation still does not start video work.
- **Cache the story per lesson version.** A story is generated once and reused by both locales and by Recreate until content generation republishes the lesson. Recreate submits the cached story to the provider again instead of rewriting it.
- **Preserve failure isolation.** A story or provider failure marks only the requested video variant `FAILED`; the lesson, cards, questionnaire, game, attempts, other locale, and stored media remain available.
- **Provider lifecycle is durable.** The adapter records the provider job id, status, progress, and last error, so a worker restart can resume polling instead of losing the request.
- **Store provider outputs through the existing media contract.** The MP4, WebVTT captions, and poster keep the current storage keys and share-token/admin media routes, so student playback and teacher preview do not change.
- **Remove the local video pipeline from the default path.** The `narration`, `tts`, `visual`, and `render` stages are replaced by story and provider stages. Existing local TTS/ffmpeg/character modules stay in the repository during migration but are no longer invoked by video generation; deleting them is out of scope for this change.
- **Reject unusable provider output.** Duration, file type, size, and free-disk checks apply when a downloaded video is ingested; a failed check marks the variant `SKIPPED` or `FAILED` with a clear reason.

### Assumptions

The user dismissed the clarifying questions, so this proposal records these assumptions for review:

- The "video creation AI server" is reached over HTTP through a configurable adapter (`base URL`, `API key`, optional model), not a hard-coded vendor SDK. The exact request/response mapping is defined in `design.md` and may be adapted to the real server without changing the spec.
- The new flow replaces the local TTS + ffmpeg + character composition path for video. The existing character-art feature is left in place but is not required by, or part of, video generation in this change.
- Storytelling is one continuous arc with scene-to-page anchors, not one independent script per page.
- The agent receives the already extracted page text; PDF parsing stays in the existing extraction stage.

## Capabilities

### New Capabilities

- `story-generation`: turn extracted lesson pages into a validated, bilingual, source-anchored story with ordered scenes, including long-document handling, caching, and failure isolation.

### Modified Capabilities

- `video-presentation`: replace narration/TTS/local composition with story preparation and an external AI video provider; define provider job lifecycle, output ingestion, playback artifacts, and per-variant failure behavior.
- `lesson-generation`: the separately prepared media artifact is a story rather than per-page narration scripts.
- `content-generation`: publishing new content invalidates the cached story instead of clearing narration segments.
- `localization`: the localized generated-content contract names story scenes and provider captions instead of narration segments.

## Impact

- **New code**: `src/server/story/` (story schemas, prompts, provider, validation, normalization), `src/server/video/` (video-provider interface, HTTP adapter, mock adapter, submission/poll/ingest service), worker processors for story and provider polling.
- **Modified code**: `src/server/queue.ts` (stage names and delayed polling jobs), `src/worker/index.ts` (stage dispatch and failure handling), `src/app/api/admin/lessons/[lessonId]/video/route.ts` (start story instead of narration), `src/server/repositories/lesson-status.ts`, `src/server/services/lesson-control.ts` (clean story/provider files), `src/server/media/serve-media.ts` (provider poster fallback), `src/components/admin/video-variant-controls.tsx` and admin/student status copy for provider progress, `src/lib/env.ts`, `.env.example`, `docker-compose.yml`/`Dockerfile` only if new runtime config is needed.
- **Database**: add `LessonStory` and `StoryScene` (or equivalent) and extend `VideoAsset` with provider metadata (`providerJobId`, `provider`, `progress`, `submittedAt`, `completedAt`); add `STORY` and provider stages to `JobStage`. Migration required.
- **Removed from the video path**: the `NARRATION`, `TTS`, `VISUAL`, and `RENDER` chain as invoked by the video route. `NarrationSegment` becomes legacy; existing rows may be retained or migrated.
- **Configuration**: `VIDEO_PROVIDER=api|mock|disabled`, `VIDEO_AI_BASE_URL`, `VIDEO_AI_API_KEY`, `VIDEO_AI_MODEL`, `VIDEO_AI_POLL_INTERVAL_MS`, `VIDEO_AI_TIMEOUT_SECONDS`; existing `MAX_VIDEO_SECONDS`, `MAX_PDF_PAGES`, `GENERATION_MAX_ATTEMPTS` still apply.
- **Docs/tests**: update `docs/media.md`, `docs/generation.md`, `README.md`; add unit tests for story validation, provider adapter request/poll/ingest, timeout and cancellation behavior, and per-locale isolation; update admin/student video tests and integration coverage.
- **Operational**: video processing now depends on an external service. Provider outages must be visible as per-variant failures, must not fail lessons, and must be retryable. No student data is sent to the story or video provider.
