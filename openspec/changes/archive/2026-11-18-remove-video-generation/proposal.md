# Proposal

## Why

Lesson video is an optional layer over the core study flow, but it currently accounts for two separate generation pipelines, a provider integration, an artwork pipeline, several worker stages, private media routes, and three dedicated capabilities. The product no longer wants video, and keeping the machinery leaves unused provider configuration, storage, UI, and a large test surface that must be maintained alongside the features students actually use.

## What Changes

- **BREAKING** Remove the student Video tab, the admin video-variant controls, video previews, and the character-status panel. Lessons present only the PDF, Cards, Game, and Quiz modes.
- **BREAKING** Retire the `video-presentation`, `story-generation`, and `lesson-character-art` capabilities, including their requirements and spec files.
- **BREAKING** Remove both video production paths: the AI provider flow (story → video submit → poll → ingest) and the local narration → TTS → ffmpeg composition flow.
- Remove page-image rendering from extraction and the visual/art-direction/image-generation code used only to compose video frames.
- Remove the `NarrationSegment`, `LessonStory`, `StoryScene`, `VideoAsset`, and `LessonVisual` data models, their enums, and the queue stages that feed them. A migration drops the tables and enum values.
- Delete stored `video`, `audio`, `visual`, and page-image artifacts from lesson storage for existing lessons, add the same cleanup to lesson/class deletion, and keep future lessons free of those prefixes.
- Remove video/AI-provider/TTS/image environment variables, `media` documentation, media event messages, admin/student media routes, and all video, story, narration, visual, TTS, render, and ingest tests and end-to-end steps.
- Update the affected capabilities so their requirements describe cards, questions, PDF, game, and quiz only: no narration scripts, story scenes, captions, video variants, or artwork.
- Preserve lesson ingestion, PDF viewing, content generation, card/question editing, share links, questionnaire, game, attempts, and assessment summaries unchanged.

## Capabilities

### New Capabilities

None. This change only removes behavior.

### Modified Capabilities

- `video-presentation`: Retired. Every requirement is removed because the product no longer generates, previews, streams, or stores lesson video.
- `story-generation`: Retired. Every requirement is removed because stories exist only to feed a video provider.
- `lesson-character-art`: Retired. Every requirement is removed because character and scene artwork exist only to compose lesson video.
- `student-experience`: The lesson-tabs requirement drops the Video mode and its unavailable state.
- `localization`: Localized generated content no longer includes story narration, captions, or video variants.
- `lesson-generation`: The artifact set, source grounding, and bilingual output requirements no longer mention or prepare stories.
- `content-generation`: The purpose and requirements stop describing narration production and stale-story invalidation.
- `card-editing`: The invariant that card edits leave narration and videos untouched is reduced to the artifacts that remain.
- `question-editing`: The invariant that question edits leave narration and videos untouched is reduced to the artifacts that remain.

## Impact

- **UI**: `src/components/student/lesson-tabs.tsx`, `src/components/admin/video-variant-controls.tsx`, `src/app/[locale]/admin/lessons/[lessonId]/page.tsx`, `messages/en.json`, `messages/el.json`.
- **API**: delete the admin `video`, admin `visual`, admin media, and student media routes. The PDF source route and generic `serveStoredMedia` stay because the PDF tab uses them.
- **Server/worker**: delete `src/server/video/**`, `src/server/story/**`, the visual/image/TTS/render modules under `src/server/media/**`, and the narration, story, TTS, visual, video, and render processors. Trim queue stages, worker failure handling, extraction page-image rendering, lesson control cleanup, publication invalidation, and admin lesson queries.
- **Data**: new Prisma migration drops `VideoAsset`, `LessonStory`, `StoryScene`, `NarrationSegment`, `LessonVisual`, and the related enum values; regenerate the Prisma client.
- **Storage**: a one-off cleanup script removes `lessons/*/video`, `lessons/*/audio`, `lessons/*/visual`, and `lessons/*/pages` objects for existing lessons.
- **Configuration/docs**: remove video, story, TTS, and image variables from `src/lib/env.ts`, `.env.example`, and `.env`; delete `docs/media.md` and video sections in README, generation, operations, i18n, and deployment docs.
- **Tests**: remove video/story/narration/visual/render/TTS/ingest test files and their fixtures; update shared integration, security, worker, env, message, component, and e2e suites.
- **Overlap**: the in-progress `add-lesson-pdf-tab` change already touches the student tab order and `pdf-viewer`. This change must preserve its PDF tab and apply the Video-tab removal on top of it.
