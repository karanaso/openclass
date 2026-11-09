# Proposal

## Why

The admin lesson page's "Video variants" card reports each locale's status, but a `READY` variant is rendered as an inert badge. A teacher cannot preview the video without opening a student share link and entering a student name, and cannot re-render a variant that is already ready (for example after a narration or visual change). This makes it hard to verify or refresh the student-facing video from the page that manages it.

## What Changes

- Add a **Play** and a **Recreate** action next to every video variant in the admin lesson page's video variants list.
- Play opens an authenticated preview of that locale's rendered video inside the admin page, with poster, captions, and seek support; it is unavailable while the variant is not ready.
- Recreate queues a fresh narration/TTS and render for that locale, including when the variant is already `READY`, without regenerating cards, questions, or the lesson visual set.
- Show in-progress state, prevent duplicate concurrent recreate requests, and keep failures isolated to the affected variant.
- Add Greek and English labels for the new actions and states.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `video-presentation`: the system must expose per-locale preview and re-render controls to an authenticated teacher, in addition to the existing generation and student playback behavior.

## Impact

- `src/components/admin/video-variant-controls.tsx` and `src/app/[locale]/admin/lessons/[lessonId]/page.tsx`: per-variant Play/Recreate controls and inline preview.
- New `src/app/api/admin/lessons/[lessonId]/media/[locale]/[kind]/route.ts` guarded by `withAdmin`, reusing the existing range-streaming logic so admin previews do not depend on a share token.
- `src/app/api/admin/lessons/[lessonId]/video/route.ts`, `src/server/queue.ts`, and `src/worker/processors/tts.ts`: support a forced re-render whose BullMQ job id does not collide with a retained completed job and propagates through to the render stage.
- `messages/en.json` and `messages/el.json`: new action, preview, and status labels.
- Tests: component/interaction coverage for the controls, admin media route authorization and range behavior, and an e2e path for preview and recreate.
