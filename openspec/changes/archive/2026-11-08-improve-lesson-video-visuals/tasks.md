# Tasks

## 1. Configuration and data model

- [x] 1.1 Add `OPENAI_ART_DIRECTION_MODEL` to the env schema (optional, resolving to `OPENAI_TEXT_MODEL`) and change the `OPENAI_IMAGE_QUALITY` default to `high`; update `.env.example`; verify with `tests/env.test.ts` and a new assertion that the defaults resolve as documented.
- [x] 1.2 Extend `LessonVisual` with `artBrief`, `artBriefModel`, `artBriefFallback`, `imageQuality`, `generationId`, and `lastError`, then add a Prisma migration; verify with `npx prisma validate` and `npx prisma generate`.

## 2. Art-direction brief and image prompts

- [x] 2.1 Add an art-direction provider with a zod-validated `ArtBrief` shape, an OpenAI structured-output implementation, a deterministic mock, and a fallback builder for text-call failures; verify with unit tests covering valid output, invalid output fallback, and exclusion of student data.
- [x] 2.2 Rewrite the scene and character prompts for `VISUAL_PROMPT_VERSION = "v2"` so both consume the brief and request a 3×2 transparent sheet with neutral, blink, talk-closed, talk-open, wave, and lean cells; verify with `tests/image-prompts.test.ts` assertions for the brief fields, six poses, and existing safety constraints.
- [x] 2.3 Update the OpenAI image provider to request a `1536x1024` transparent character sheet and to use the configured model and quality; verify with `tests/image-provider.test.ts` assertions for size, transparency, model, and the new quality default.

## 3. Six-pose character sheet and animation

- [x] 3.1 Update `character.ts` to a 1536×1024 sheet with a 3×2 pose layout, and validate alpha coverage, bounding-box scale, and baseline per cell before slicing; verify with `tests/character.test.ts` cases for a valid sheet, wrong dimensions, an empty cell, and a misaligned cell.
- [x] 3.2 Replace the mock character-sheet fixture with a deterministic 1536×1024 six-cell RGBA PNG; verify the fixture dimensions and alpha with the image-provider and character tests.
- [x] 3.3 Replace the loop sequence with the talking/blink/wave/lean sequence from the design; verify loop duration, pose coverage, and a real ffmpeg render in `tests/media.integration.test.ts`.

## 4. Video composition polish

- [x] 4.1 Add checked-in static RGBA assets for the rounded slide mask/shadow and the 1920×1080 vignette/panel treatment; verify their dimensions and alpha with a small asset test.
- [x] 4.2 Extend the composed filter graph with segment-aware scene panning, slide fade/drift entrance, and character breathing/sway on top of the existing bob; verify `tests/render-video.test.ts` asserts the new graph expressions and an integration storyboard check shows scene or character motion between frames.
- [x] 4.3 Keep the poster as the first composed frame and confirm it matches the first video frame in the media integration test; verify the standard full-slide fallback still renders when artwork is unavailable or invalid.

## 5. Non-destructive artwork lifecycle

- [x] 5.1 Refactor visual generation to write versioned keys under `lessons/<lessonId>/visual/<generationId>/`, swap the `LessonVisual` row only after every asset succeeds, delete the previous generation best-effort, and record `lastError` without discarding usable art; verify with an integration test where regeneration fails and the previous keys remain readable.
- [x] 5.2 Add prompt-version staleness and a `force` option to `ensureLessonVisual`, and persist the brief, brief model, fallback flag, image model, quality, generation id, and prompt version; verify with integration cases for a `v1` row regenerating, a forced regeneration, and an unchanged `READY` row being reused.
- [x] 5.3 Update the visual-failure path so an initial failure still marks the row `FAILED` while a failed regeneration keeps the previous `READY` status and exposes the error; verify with integration assertions on both paths.

## 6. Visual-only regeneration stage

- [x] 6.1 Add `visual` to the queue `PipelineStage` union and the worker routing, and implement `processVisual` to force artwork generation and then fan out render jobs for every locale that already has a video asset; verify with queue job-id tests and a worker/integration test that existing variants are re-rendered and content artifacts are untouched.
- [x] 6.2 Add `POST /api/admin/lessons/[lessonId]/visual` guarded by `withAdmin({ mutation: true })`, rejecting cancelled lessons and returning `409` while a visual job is pending or generating; verify with route tests for authorization, success, and conflict.
- [x] 6.3 Ensure a visual-only regeneration reuses existing narration audio and does not enqueue `generate`, `extract`, or `tts`; verify with an integration test that card, question, and narration rows are unchanged after regeneration.

## 7. Teacher artwork preview and controls

- [x] 7.1 Add an authenticated `GET /api/admin/lessons/[lessonId]/visual/[kind]` route for `scene` and `character` that streams private storage; verify with security tests for unauthenticated access and successful authenticated reads.
- [x] 7.2 Add scene and character thumbnails plus a pending-aware **Regenerate artwork** button to the lesson detail video card, cache-busted by the visual `updatedAt` value; verify with a component test covering preview rendering, regeneration request, and pending state.
- [x] 7.3 Add the new Greek and English labels and last-regeneration-error copy; verify with `tests/messages.test.ts` that both locales contain the keys.

## 8. Documentation

- [x] 8.1 Update `docs/media.md` with the art brief, six-pose sheet, talking loop, composition motion, visual-only regeneration, the `gpt-4.1-mini` plus `gpt-image-1 high` recommendation, `gpt-image-1-mini` trade-offs, cost, and troubleshooting; verify the documented env names match `.env.example`.
- [x] 8.2 Update `docs/generation.md` to record the art-direction text call and model, and clarify that `gpt-4-mini` is not a valid model; verify the documented defaults match `src/lib/env.ts`.

## 9. Integration verification

- [x] 9.1 Run `npm test`, `npm run typecheck`, and `npm run lint`; verify all pass.
- [x] 9.2 Run the media integration suite and confirm a fresh lesson produces a character video with the new layout and a failed or invalid sheet still produces the standard video.
- [x] 9.3 Run the admin end-to-end path for artwork preview and regeneration, and confirm the regenerated artwork appears in the refreshed video variants.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Re-render a small set of representative lessons and compare output quality and render time before a wider rollout.
