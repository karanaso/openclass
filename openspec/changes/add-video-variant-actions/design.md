# Design

## Context

See `proposal.md` for motivation and `specs/video-presentation/spec.md` for required behavior.

The admin lesson page (`src/app/[locale]/admin/lessons/[lessonId]/page.tsx`) already loads `lesson.videos` and passes `{ locale, status, error }` to `VideoVariantControls`. That component renders a status badge for `READY` and a generate button otherwise. The re-render API (`POST /api/admin/lessons/[lessonId]/video`) checks narration availability and queues the `tts` stage, which stores audio and then queues `render`; the renderer reuses `ensureLessonVisual` when `LessonVisual.jobVersion` matches, so bumping the lesson version would unnecessarily regenerate artwork.

Rendered media is stored privately and is currently served only by `GET /api/s/[token]/lessons/[lessonId]/media/[locale]/[kind]`, which requires a student session bound to a share token and a READY `VideoAsset`. There is no teacher-scoped media endpoint, and no way to identify a retained BullMQ job as a duplicate of an intentionally repeated render: `jobIdFor` is `${lessonId}-${stage}-${version}${locale}`, while completed jobs are retained (`removeOnComplete: 200`).

## Goals / Non-Goals

**Goals:**

- Give the teacher an in-page preview of each `READY` variant without creating a share link or student session.
- Make "Recreate" reliably queue a new render for a locale, including when the variant is already `READY`.
- Reuse the existing queue, TTS, render, and storage paths rather than adding a second video pipeline.
- Keep media private and keep the student media contract unchanged.

**Non-Goals:**

- Re-generating cards, questions, narration scripts, or the lesson visual set when recreating a video.
- Adding a general media library, download action, or public admin preview URL.
- Reworking the student video player or its share-token authorization.

## Decisions

### Per-variant action row with an inline preview

`VideoVariantControls` becomes the single owner of the locale rows. For each locale it renders the locale label, the existing status badge, and actions:

- `READY`: Play and Recreate.
- `FAILED` or `SKIPPED`: Recreate, still showing the recorded error.
- `PENDING` or `RENDERING`: no active actions, so duplicate work cannot be started from the UI.
- No asset yet: Generate (the existing behavior), using the same POST endpoint.

Play toggles one inline `<video controls preload="metadata">` panel with poster and caption track, keyed by locale; opening a second locale closes the first. URLs are built client-side from the lesson id and locale. If the element's media fetch fails, the row shows a small unavailable message instead of leaving a broken player. Keeping the preview inline avoids adding a dialog primitive the project does not currently have.

Existing `data-testid="video-variant-${locale}"` is retained on the primary action so current selectors keep working; new selectors such as `video-play-${locale}`, `video-recreate-${locale}`, and `video-preview-${locale}` identify the additions.

### Teacher-scoped media route with shared streaming

Add `GET /api/admin/lessons/[lessonId]/media/[locale]/[kind]` guarded by `withAdmin`, accepting the same `video`, `captions`, and `poster` kinds as the student route. It looks up the `VideoAsset` by `lessonId_locale`, returns `404` unless the status is `READY` and the requested key exists, and streams from storage with range support.

Extract the byte-range handling from the student route into a shared helper (for example `src/server/media/serve-media.ts`) parameterized by storage object key, content type, cache policy, and range handling. Both routes use it; only their authorization and lookup differ.

- Why: a separate route keeps admin session auth and student share-token auth from becoming interchangeable, and prevents a teacher preview from requiring a share link.
- Alternatives rejected:
  - Creating a short-lived share link for preview would mutate link state and expose a student credential for an admin action.
  - Letting the student route accept either a token or a teacher cookie would mix two auth models in one handler and risk bypass mistakes.
  - Returning a public storage URL would violate the existing private-media requirement.

### Force a fresh queued job without changing the lesson version

Extend `PipelineJob` with an optional `runId`. `jobIdFor` appends it when present. The admin video route generates a `runId` for every accepted request and propagates it from the `tts` stage to the `render` stage, so a retained completed job with the old id cannot swallow the new work.

The route reads the current `VideoAsset` status first: if it is `PENDING` or `RENDERING`, respond `409` and queue nothing. Otherwise it enqueues with the new `runId` and returns `202`. The component also disables actions locally while its request is in flight and refreshes after success.

Do not increment `lesson.jobVersion`: `ensureLessonVisual` treats a version change as a request to regenerate the visual set, which would break the "artwork is reused" scenario and cost unnecessary image generation.

- Why: a per-request id is the smallest change that makes an intentional repeat distinguishable from a duplicate, and leaving the version alone preserves visual reuse.
- Alternatives rejected:
  - Removing the retained completed job before enqueueing is race-prone and could remove an active or still-useful job.
  - Always using a nonce for every pipeline stage would defeat BullMQ deduplication for extraction and generation.
  - A separate "re-render" queue worker would duplicate the existing TTS/render orchestration.

### Immediate processing feedback

The worker already sets the variant to `PENDING` and the lesson to `RENDERING` at the start of TTS, then sets `RENDERING` again before composition. The component shows a local pending state as soon as the request is accepted and calls `router.refresh()`; the persisted badge catches up when the worker starts. No additional database transition is added to the route, avoiding a state that claims a render is queued when enqueueing actually failed.

### Localized labels

Add labels for Play, Recreate, preview-unavailable, and preview-pending states to `messages/en.json` and `messages/el.json`, keeping the catalogs in sync with the existing messages test.

## Risks / Trade-offs

- **Recreate invalidates a video students may be watching** → The existing media route returns data from the same key; replacing the file can interrupt an in-flight read. Acceptable for a teacher-initiated refresh; the variant returns to processing and students see the unavailable state until it is ready.
- **Queue job leaves a stale `PENDING` state if the worker is down** → This already applies to existing generation; the status is visibly processing and can be recreated once the status is no longer pending/rendering.
- **Admin media route becomes an alternate media entry point** → It is guarded by `withAdmin`, returns only READY assets for an existing lesson, and uses `private` caching; no token or storage path is exposed.
- **Inline player grows the card on narrow screens** → The preview is full-width inside the card and stacks below the row; the lesson page already uses responsive grids.
- **Request race can queue two jobs** → The UI disables actions and the route rejects an already-processing variant; the worst case is redundant work, not a data change to cards or questions.

## Migration Plan

1. Ship the shared streaming helper and the admin media route.
2. Ship the queue `runId` support and the route/component changes together; old queued jobs remain valid because `runId` is optional.
3. Add translations and tests.
4. Rollback: revert the application. Stored videos and existing queue entries remain usable; no schema migration is required.

## Open Questions

None.
