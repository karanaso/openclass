# Design

## Context

The application currently carries two independent video producers:

1. **Provider flow**: `STORY` builds a bilingual story, `VIDEO_SUBMIT` sends it to an external AI video server, and `VIDEO_POLL` ingests the result into `VideoAsset`.
2. **Local flow**: `NARRATION` (generated scripts) → `TTS` (audio files) → `RENDER` (ffmpeg composition using `LessonVisual` artwork and PDF page images).

A separate admin UI and two media routes serve the results, and extraction eagerly renders PDF pages to PNG. The `add-lesson-pdf-tab` change is in progress and already updates the student tabs and reuses `serveStoredMedia` for the source PDF. See `proposal.md` for motivation and `specs/` for the required end state.

## Goals / Non-Goals

**Goals:**

- Remove every video producer, consumer, route, model, stage, setting, and asset.
- Keep lesson ingestion, PDF viewing, content generation, cards, questions, game, quiz, share links, and assessment intact.
- Leave no dead Prisma relations, queue stages, or worker failure branches.
- Make the destructive data and file cleanup explicit, repeatable, and auditable.
- Avoid breaking the in-progress PDF tab work.

**Non-Goals:**

- Reworking the remaining tab layout, generation prompts, or provider configuration.
- Removing general-purpose dependencies that other features use (`bullmq`, `next-intl`, `howler`, `unpdf`, storage helpers).
- Deleting historical migrations. Only a new forward migration is added.
- Recovering or archiving previously generated videos.

## Decisions

### Delete the video code paths instead of feature-flagging them

Every producer module, route, component, message key, test, and environment flag is deleted. A flag would leave the same maintenance and configuration burden the change exists to remove, and the product decision is final. The provider adapters (`src/server/video/**`), story modules (`src/server/story/**`), and visual/image/TTS/render modules under `src/server/media/**` are removed together.

### Retire three capabilities

`video-presentation`, `story-generation`, and `lesson-character-art` have no consumer after removal. Their delta specs remove every requirement; OpenSpec retires a capability when its last requirement is removed, deleting the main spec and empty directories. No replacement capability is introduced.

### Drop the data model and remap retired statuses

A new Prisma migration:

- Drops `VideoAsset`, `LessonStory`, `StoryScene`, `NarrationSegment`, and `LessonVisual` (children before parents where needed).
- Drops `StoryStatus`, `VideoStatus`, and `VisualStatus`.
- Remaps any lesson with `LessonStatus.RENDERING` to `READY`, then recreates the `LessonStatus` enum without `RENDERING`.
- Deletes `generation_jobs` rows whose stage is `NARRATION`, `STORY`, `TTS`, `VISUAL`, `VIDEO_SUBMIT`, `VIDEO_POLL`, or `RENDER`, then recreates `JobStage` without those values. Rows must be deleted before the type change or the cast fails.
- Removes the `videos`, `visual`, `story`, and `narration` relations from `Lesson`.

Keeping unused tables or enum values was rejected: it would preserve ambiguity about whether video might return and leave ORM types that the application no longer owns. A follow-up "cleanup" migration would be strictly worse than doing it now.

### One cleanup script handles stored artifacts

`src/scripts/cleanup-video-artifacts.ts` (wired as an npm script) reads lesson ids and deletes these prefixes:

- `lessons/<id>/video`
- `lessons/<id>/audio`
- `lessons/<id>/visual`
- `lessons/<id>/pages`

It is dry-run by default and deletes only with `--apply`, logs missing prefixes without failing, and reports per-lesson errors while continuing. The source PDF at `Lesson.storageKey` is never touched. The script is not run automatically by the migration: database changes and object deletion deploy separately so storage failures cannot block schema deployment. `cancelLesson` and `deleteLesson` keep deleting these prefixes for any stragglers.

### Keep the generic media helper and PDF route

`serveStoredMedia` is used by the PDF tab's source route and remains. `MEDIA_CONTENT_TYPES` describes only video, captions, and posters, so it is removed. The student and admin media routes, the admin visual route, and the admin video request route are deleted.

### Worker and queue safety

Queue stages are reduced to `extract`, `generate`, and the existing text-only flow. The worker no longer imports `resumeVideoJobs` or any video processor. Because Redis may still hold queued video jobs at deploy time, the worker's default branch logs an unsupported stage and returns instead of throwing, and a documented drain step removes retired jobs before the new worker starts. Active jobs simply finish their current attempt and their stage becomes unsupported.

### Presentation and configuration cleanup

- `lesson-tabs.tsx` loses the `video` tab, `Film` icon, `primaryVideo`, player, badges, and processing/unavailable states. `lesson-data.ts` loses `StudentVideo`, the `videos` query, and URL mapping.
- The admin lesson page loses video-variant and artwork panels; `getLessonDetail` stops including `videos` and `visual`.
- Messages lose `student.tabs.video`, `student.videoProcessing`, `student.videoProgress`, all `admin.video*`, `admin.character*`, `admin.artwork*`, and the home-page video feature copy. Home badges and descriptions are rewritten in both locales.
- Environment variables for story, video, TTS, art direction, image models, and video limits are removed; `MAX_PDF_PAGES` stays because upload ingestion enforces it. `TTS_PROVIDER`, `IMAGE_PROVIDER`, and related validation refinements disappear.
- The Docker image stops installing `ffmpeg` and `poppler-utils`, since page rasterization was their only use. Verify with a build and the Docker smoke test.
- `docs/media.md`, `scripts/generate-media-assets.py`, overlay assets, and video fixtures are deleted; remaining docs are rewritten to describe the text/PDF-only pipeline.

## Risks / Trade-offs

- **Destructive data loss** → Take a database and storage backup (`npm run backup`) before migration; run the cleanup script in dry-run first; document that previously generated videos cannot be recovered.
- **Migration fails on existing enum rows** → Delete retired `generation_jobs` rows and remap `RENDERING` lessons before recreating enums; test the migration against a database seeded with legacy video/story rows.
- **Legacy Redis jobs fail after deploy** → Worker logs and ignores unsupported stages; drain retired jobs before starting the new worker.
- **Overlap with `add-lesson-pdf-tab`** → Preserve the PDF tab and its order/default behavior; remove only Video. If that change is still unarchived, its `student-experience` delta must also drop Video before either archives, otherwise the later archive reintroduces it.
- **Missed incidental references** → Use repository-wide searches for model names, stage names, routes, message keys, and env vars; run typecheck, lint, unit, integration, and e2e suites after removal.
- **Archive order changes spec history** → Archive this change after the PDF change, or re-sync the PDF delta, so the final `Lesson tabs` requirement has no Video mode.

## Migration Plan

1. Stop teachers from starting new work and drain the worker.
2. Back up the database and storage; run the cleanup script in dry-run and review its output.
3. Deploy the new application and worker together so code and schema agree.
4. Apply the Prisma migration (drops tables/enums and retired job rows).
5. Run `cleanup-video-artifacts --apply` to purge stored video, audio, artwork, and page images.
6. Verify a READY lesson opens on the PDF tab and that Cards, Game, and Quiz work; verify a new upload generates cards and questions without video stages.
7. Roll back by restoring the database and storage backups and redeploying the previous release. The migration itself is forward-only.

## Open Questions

None.
