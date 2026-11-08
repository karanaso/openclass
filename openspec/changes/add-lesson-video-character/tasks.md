# Tasks

## 1. Data model and configuration

- [ ] 1.1 Add `VisualStatus`, `LessonVisual`, the `Lesson.visual` relation, and the `VISUAL` `JobStage` value in `prisma/schema.prisma`; verify with `npx prisma validate` and `npx prisma generate`.
- [ ] 1.2 Create and inspect the Prisma migration for the new enum/table; verify the generated SQL creates `LessonVisual`, its unique lesson index, cascade delete, and the `VISUAL` enum value.
- [ ] 1.3 Add `IMAGE_PROVIDER`, `OPENAI_IMAGE_MODEL`, and `OPENAI_IMAGE_QUALITY` to the env schema, including the effective-provider fallback to `AI_PROVIDER` and the OpenAI key requirement; verify with new and updated cases in `tests/env.test.ts`.
- [ ] 1.4 Document the new variables and their defaults in `.env.example`; verify the values and comments match the env schema names.

## 2. Image generation

- [ ] 2.1 Implement scene and character-sheet prompt builders that use the lesson title plus a bounded page-text excerpt and encode the no-text, no-logo, no-real-person, school-appropriate constraints; verify unit tests assert the excerpt bound, safety clauses, and absence of student fields.
- [ ] 2.2 Define the `ImageProvider` interface and implement the OpenAI provider against `POST /v1/images/generations` with configurable model, quality, exact sizes, and transparent character output; verify a unit test covers request shape and provider error propagation with a stubbed `fetch`.
- [ ] 2.3 Implement the mock image provider backed by deterministic PNG fixtures, add the fixtures, and implement the provider factory honoring `openai`, `mock`, `disabled`, and the `AI_PROVIDER` fallback; verify unit tests cover factory selection and that fixture PNGs meet the expected dimensions and alpha requirement using ffprobe.
- [ ] 2.4 Store generated scene and sheet PNGs under `lessons/<lessonId>/visual/` and record model/prompt version on the visual row; verify an integration test asserts both files exist and the stored row points at them.

## 3. Sprite validation and animation

- [ ] 3.1 Implement sprite-sheet validation (exact grid size, square cells, alpha channel) and quadrant slicing with ffmpeg; verify unit tests accept the mock fixture and reject wrong-size and opaque images without producing frames.
- [ ] 3.2 Implement the 6-second idle loop (neutral, blink, wave, neutral holds at 30 fps) with VP9 alpha and a PNG-in-MOV alpha fallback; verify an integration test probes the loop for duration, dimensions, frame rate, and alpha pixel format.
- [ ] 3.3 Confirm the worker and all-in-one images ship an ffmpeg build with `libvpx-vp9` and alpha support; verify by running `ffmpeg -hide_banner -encoders` in the built image and add the required package if the encoder is absent.

## 4. Visual lifecycle

- [ ] 4.1 Implement `ensureLessonVisual` to generate only when no row exists or `jobVersion` is stale, reuse a current ready row, and stay idempotent across concurrent renders; verify integration tests assert one provider call for repeated renders and a new call after `jobVersion` advances.
- [ ] 4.2 Isolate visual failures: catch generation, validation, download, and encoding errors, set `LessonVisual` and `GenerationJob(VISUAL)` to failed with a truncated reason, and return no visual; verify an integration test with a throwing provider yields a failed visual row and a ready standard video.
- [ ] 4.3 Delete visual storage and the visual row when a lesson is cancelled, and confirm cascade cleanup on lesson deletion; verify integration tests assert the `visual/` prefix and row are gone after cancellation and after deletion.

## 5. Video composition

- [ ] 5.1 Extend `composeLessonVideo` with an optional visual input and build the side-panel filter graph (1920×1080 scene, slide fitted inside 1280×960 at 64,60, character scaled to ~480 px in the right panel with a sinusoidal bob); verify unit tests cover filter-graph construction and integration tests produce a video with the composed dimensions and expected duration.
- [ ] 5.2 Extract the poster from the first composed frame and keep WebVTT captions derived from narration; verify integration tests assert the poster is a JPEG with the composed layout and captions still contain the narration script.
- [ ] 5.3 Render an end-to-end character video with the mock provider; verify the video is `READY`, the visual row is `READY`, files exist, and two frames sampled at different times differ, proving the character animates.
- [ ] 5.4 Render both locales and assert the same visual row and provider call count are reused; then render with a failed visual and assert the video is `READY` in the standard layout with no character.
- [ ] 5.5 Update `docs/media.md` with the visual pipeline, side-panel layout, stored outputs, failure/fallback behavior, cost expectations, and new configuration; verify the documented commands and env names match the implementation.

## 6. Teacher visibility

- [ ] 6.1 Include `LessonVisual` in `getLessonDetail` and add a compact character status to the admin video card (ready, unavailable with reason, or not generated), with Greek and English messages; verify message-parity tests pass and an integration test asserts the detail payload includes the visual status and error.

## 7. Integration verification

- [ ] 7.1 Run `npm run typecheck`, `npm test`, and `npm run lint`; verify all pass.
- [ ] 7.2 Run `npm run test:integration`; verify all media, generation, class, and repository integration suites pass, including the new character and fallback cases.
- [ ] 7.3 Render a mock-mode lesson video and inspect extracted frames at 0 s and mid-slide; verify the slide is uncropped and readable, the character sits in the right panel, and the background is lesson-relevant artwork.

## Workflow follow-up

- Archive the change after review and implementation are complete.
- Verify the archived specs contain the new `lesson-character-art` capability and the updated `video-presentation` requirements.
