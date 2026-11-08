# Proposal

## Why

The narrated lesson video is currently a sequence of full-frame PDF pages with narration. It is functional but visually static, and the pages alone rarely communicate the lesson's subject or tone. A friendly animated character and a lesson-relevant illustrated scene give students a recognizable host and visual context, increasing engagement without changing the lesson content they are assessed on.

## What Changes

- Generate one lesson-specific visual set from the lesson's extracted text: a full-bleed background scene relevant to the lesson topic and a transparent-background character sprite sheet with idle poses (neutral, blink, wave).
- Reuse that visual set for every slide and for both language variants of the video; it is generated at most once per lesson and only regenerated when the lesson is regenerated.
- Change video composition from a full-frame slide to a side-panel layout: the PDF slide remains large and readable on the left, while the lesson scene fills the frame and the animated character occupies the right-hand panel.
- Animate the character on a continuous idle loop (gentle bob, periodic blink, occasional wave) in every video segment.
- Compose the poster frame from the same layout so students see the character before playback.
- Treat the character and scene as a best-effort enhancement: if image generation, sprite slicing, or animation composition fails, the video still renders in the current full-slide layout and the lesson remains usable.
- Keep character and scene artwork free of student data, readable text, logos, and real-person likenesses; derive prompts only from lesson title and page text.
- Record artwork generation status, model, and failure reason so the teacher can see why a video has no character.

## Capabilities

### New Capabilities

- `lesson-character-art`: Per-lesson generation, storage, validation, reuse, and failure isolation of a lesson-relevant background scene and animated character sprite set.

### Modified Capabilities

- `video-presentation`: Video composition now includes a side-panel scene and animated character, a matching poster, reuse of one visual set across locale variants, and a fallback to the existing layout when artwork is unavailable.

## Impact

- `prisma/schema.prisma`: add `LessonVisual` (one per lesson) and a `VisualStatus` enum; extend `JobStage` with `VISUAL` for usage/status tracking.
- `src/lib/env.ts`, `.env.example`, `docs/media.md`: add image-provider configuration (`IMAGE_PROVIDER`, `OPENAI_IMAGE_MODEL`) and document cost/failure behavior.
- `src/server/media`: new image-provider abstraction with OpenAI and mock implementations, sprite-sheet slicing/validation, and character loop rendering; extend `render-video.ts` and `ffmpeg.ts` with the composed layout.
- `src/worker/processors/render.ts`: ensure the lesson visual set exists before composing, reuse it when current, and fall back to the standard layout when it is unavailable.
- `src/server/storage`: store artwork under `lessons/<lessonId>/visual/` alongside existing private media.
- `src/app/[locale]/admin/lessons/[lessonId]/page.tsx`, `messages/el.json`, `messages/en.json`: show a small character status in the teacher's video card so a visual failure and its reason are visible.
- Tests: unit coverage for prompts/sprite validation and media integration coverage for character video, fallback video, and locale reuse. No student-facing UI change is required because the result is inside the existing MP4.
- Cost: two image-generation requests per lesson (scene and sprite sheet), not per page or per locale; mock provider keeps development and CI free.
