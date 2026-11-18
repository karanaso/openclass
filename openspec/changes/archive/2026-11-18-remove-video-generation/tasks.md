# Tasks

## 1. Reconcile the in-flight tab work

- [x] 1.1 If `add-lesson-pdf-tab` is still unarchived, update its `specs/student-experience/spec.md` so the `Lesson tabs` requirement lists PDF, Cards, Game, and Questionnaire without Video; verify `openspec validate add-lesson-pdf-tab --strict` and `openspec validate remove-video-generation --strict` both pass.
- [x] 1.2 Update the Purpose lines in `openspec/specs/content-generation/spec.md` and `openspec/specs/lesson-generation/spec.md` so they no longer claim narration scripts or story preparation; verify `openspec validate remove-video-generation --strict` passes and those two Purpose lines contain no video, story, or narration terms.

## 2. Remove the video data model

- [x] 2.1 In `prisma/schema.prisma`, remove `NarrationSegment`, `LessonStory`, `StoryScene`, `VideoAsset`, and `LessonVisual`, the `StoryStatus`, `VideoStatus`, and `VisualStatus` enums, the retired `JobStage` values, `LessonStatus.RENDERING`, and the `Lesson.videos`, `Lesson.visual`, `Lesson.story`, and `Lesson.narration` relations; verify `npx prisma validate` and `npm run db:generate` succeed.
- [x] 2.2 Add a Prisma migration that deletes `generation_jobs` rows for `NARRATION`, `STORY`, `TTS`, `VISUAL`, `VIDEO_SUBMIT`, `VIDEO_POLL`, and `RENDER`, remaps `lessons.status = 'RENDERING'` to `READY`, recreates `LessonStatus` and `JobStage`, and drops the five video/story/visual tables plus their enums; verify `npx prisma migrate deploy` on a database seeded with a legacy video lesson and story rows, then confirm the tables, enums, and retired values are gone.
- [x] 2.3 Remove removed-model access from `src/server/repositories/publication.ts`, `src/server/services/lesson-control.ts`, `src/server/services/classes.ts`, `src/worker/failures.ts`, and any seed or test helper; verify `npm run typecheck` and the affected integration suites (`tests/repositories.integration.test.ts`, `tests/classes.integration.test.ts`, `tests/security.integration.test.ts`) pass.

## 3. Remove the video backend and routes

- [x] 3.1 Delete `src/server/video/**` and `src/server/story/**`; verify no imports remain with `rg "@/server/(video|story)|from \"\\.\\.?/.*(video|story)" src` and that `npm run typecheck` reports no missing-module errors.
- [x] 3.2 Delete the video-only modules under `src/server/media/` (`art-direction.ts`, `character.ts`, `ffmpeg.ts`, `image-prompts.ts`, `image.ts`, `lesson-visual.ts`, `render-video.ts`, `tts.ts`, `assets/`, `fixtures/`) while keeping `serve-media.ts`; remove `MEDIA_CONTENT_TYPES` and verify the PDF source route still streams with range support through `tests/serve-media.test.ts` and the PDF route integration test.
- [x] 3.3 Delete `src/worker/processors/{narration,story,tts,visual,video,render}.ts`, reduce `PipelineStage` in `src/server/queue.ts` to the remaining stages, remove their worker handlers, failure branches, and `resumeVideoJobs`, and make the worker log and ignore an unsupported stage; verify `tests/worker-dispatch.test.ts` and `tests/queue-job-id.test.ts` pass.
- [x] 3.4 Remove page-image rendering and its warning from `src/worker/processors/extract.ts`, remove video/story/TTS/art-direction/image/video-limit variables and refinements from `src/lib/env.ts` while keeping `MAX_PDF_PAGES` and `MAX_UPLOAD_BYTES`, and delete `src/app/api/admin/lessons/[lessonId]/video/route.ts`, `src/app/api/admin/lessons/[lessonId]/visual/[kind]/route.ts`, `src/app/api/admin/lessons/[lessonId]/media/[locale]/[kind]/route.ts`, and `src/app/api/s/[token]/lessons/[lessonId]/media/[locale]/[kind]/route.ts`; verify `tests/env.test.ts` passes and `npm run typecheck` has no route or env references.
- [x] 3.5 Delete `tests/video-ingest.test.ts`, `tests/video-provider.test.ts`, `tests/video-route.test.ts`, `tests/video-story.integration.test.ts`, `tests/render-video.test.ts`, `tests/media.integration.test.ts`, `tests/media-assets.test.ts`, `tests/character.test.ts`, `tests/art-direction.test.ts`, `tests/image-prompts.test.ts`, `tests/image-provider.test.ts`, `tests/lesson-narration.test.ts`, `tests/story.test.ts`, `tests/video-variant-controls.test.tsx`, and `tests/artwork-controls.test.tsx`; verify `npm test` has no missing fixture or import errors.

## 4. Update the student and admin experience

- [x] 4.1 Remove the `video` tab, `Film` icon, `primaryVideo`, player, status badges, and processing/unavailable states from `src/components/student/lesson-tabs.tsx`; remove `StudentVideo` and the `videos` query and URL mapping from `src/server/student/lesson-data.ts`; verify `tests/lesson-tabs.test.tsx`, `tests/student.integration.test.ts`, and `tests/pdf-viewer.test.tsx` pass with the PDF tab first.
- [x] 4.2 Remove the video-variant and artwork sections plus their queries from `src/app/[locale]/admin/lessons/[lessonId]/page.tsx`, delete `src/components/admin/video-variant-controls.tsx`, and stop including `videos` and `visual` in `getLessonDetail`; verify the admin lesson page renders for a READY lesson and `npm run typecheck` passes.
- [x] 4.3 Remove video, character, artwork, narration, caption, and video-status keys from `messages/en.json` and `messages/el.json`, rewrite the home badge/subtitle/feature copy and `admin.status.RENDERING`, and keep both locales' key sets identical; verify `tests/messages.test.ts` and the affected component tests pass.
- [x] 4.4 Delete `e2e/artwork.spec.ts`, remove video generation/playback/URL assertions from `e2e/student.spec.ts` and `e2e/global-setup.ts`, and keep the PDF, cards, game, and quiz flow; verify `npm run test:e2e -- e2e/student.spec.ts` passes.

## 5. Remove assets, docs, and deployment configuration

- [x] 5.1 Delete `docs/media.md`, `scripts/generate-media-assets.py`, the video fixtures under `src/server/video/fixtures/`, and the overlay assets under `src/server/media/assets/`; rewrite README and `docs/generation.md`, `docs/i18n.md`, `docs/operations.md`, and `docs/deployment.md` to describe the PDF/text pipeline only; verify `rg -i "video|story|narration|tts|character art" README.md docs src scripts` returns only intentional archive/history mentions.
- [x] 5.2 Remove the retired keys from `.env.example`, the local `.env`, `e2e/global-setup.ts`, and `tests/docker/all-in-one-smoke.sh`; verify `npm run typecheck`, `tests/env.test.ts`, and `tests/messages.test.ts` pass with no unknown-key warnings.
- [x] 5.3 Remove `ffmpeg` and `poppler-utils` from the `Dockerfile` package list and update the Docker smoke test environment; verify the all-in-one image builds and `tests/docker/all-in-one-smoke.sh` passes.

## 6. Purge stored media

- [x] 6.1 Implement `src/scripts/cleanup-video-artifacts.ts` to enumerate lessons and delete `lessons/<id>/video`, `lessons/<id>/audio`, `lessons/<id>/visual`, and `lessons/<id>/pages`, defaulting to dry-run and requiring `--apply`, logging missing prefixes and continuing after per-lesson errors; add the npm script and verify with a storage fixture that the four prefixes are reported, `--apply` removes them, and the source PDF key remains.
- [x] 6.2 Keep prefix deletion in `cancelLesson` and `deleteLesson` after removing the deleted-table calls, and remove the `pages` image warning from extraction; verify the lesson-control integration tests show no orphaned media rows or storage keys.
- [x] 6.3 Document the cleanup runbook in `docs/operations.md` (backup, dry-run, apply, verification) and verify the documented commands run as written against the local storage root in dry-run mode.

## 7. Full validation

- [x] 7.1 Run `rg -i "VideoAsset|LessonStory|StoryScene|NarrationSegment|LessonVisual|video-submit|video-poll|NARRATION|STORY|TTS|VISUAL|VIDEO_AI|STORY_MODEL|OPENAI_TTS|OPENAI_IMAGE|OPENAI_ART_DIRECTION|MAX_VIDEO_SECONDS|VIDEO_RENDER_TIMEOUT" src tests e2e prisma .env.example docs README.md Dockerfile docker-compose.yml` and confirm no live references remain outside historical migrations and archived changes.
- [x] 7.2 Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:integration`; fix all failures and confirm the remaining suites cover PDF, cards, questionnaire, game, share links, generation, and assessment.
- [x] 7.3 Build and smoke-test the application on a migrated database: `npm run build`, start the app, upload a PDF, confirm generation reaches `READY` with cards/questions only, open a lesson on the PDF tab, and confirm Cards, Game, and Quiz work with no Video tab or media requests.

## Workflow follow-up

- Archive the change after review; confirm `openspec/specs/video-presentation`, `openspec/specs/story-generation`, and `openspec/specs/lesson-character-art` are removed and that `student-experience`, `localization`, `lesson-generation`, `content-generation`, `card-editing`, and `question-editing` contain no video/story/narration requirements.
- Archive `add-lesson-pdf-tab` first or re-sync it, so the final `Lesson tabs` requirement keeps the PDF tab and omits Video.
