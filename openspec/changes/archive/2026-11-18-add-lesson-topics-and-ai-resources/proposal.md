# Proposal

## Why

Teachers already get PDF-discovered links and QR targets, but curating outside material still means leaving the app and guessing what games or videos fit a lesson. At the same time, lessons have no compact description of what they are about, so there is nothing reliable to base that search on. This change gives each lesson AI-generated bilingual topics and lets the teacher ask the AI for game and video candidates for those topics directly from the lesson admin page, with the existing review queue keeping unverified links away from students.

## What Changes

- Generate a small set of bilingual topic keywords/tags for every lesson during content generation, derived from the extracted PDF text.
- Store topics per lesson in Greek and English, with a cap per locale, and let the teacher view, add, remove, and edit them from the lesson admin page.
- Keep topics teacher-only; they are not shown in the student lesson view.
- Preserve teacher-edited topics when a lesson is regenerated instead of silently replacing them.
- Add a "Suggest games & videos" action to the teacher lesson page that asks the AI to propose game and video links for the lesson's topics.
- Store AI-proposed links with source `AI` and review status `SUGGESTED`, so they appear in the existing review queue and remain invisible to students until approved.
- Deduplicate AI proposals against existing and dismissed resources and respect the existing per-lesson resource cap.
- Treat AI proposals as unverified: the system does not fetch, open, or live-search the proposed URLs, and the teacher must review them.
- Leave QR code and link-annotation discovery unchanged.

## Capabilities

### New Capabilities

- `lesson-topics`: AI-generated, bilingual, teacher-editable lesson topic keywords and their lifecycle, limits, visibility, and regeneration behavior.

### Modified Capabilities

- `lesson-resources`: add teacher-triggered AI proposals of game and video resources, an `AI` discovery source, review-queue routing, deduplication, and failure behavior.

## Impact

- Database: add topic storage and a teacher-edited marker to `Lesson`; add `AI` to the `ResourceSource` enum with a Prisma migration.
- Generation: extend provider types, schemas, prompts, mock/OpenAI providers, and the orchestrator so topic extraction is best-effort and non-blocking.
- Services/API: add lesson topic read/update and AI resource-suggestion operations, with teacher-only, same-origin mutations; new admin route for topic updates and AI suggestions.
- UI: add a topics editor and a "Suggest games & videos" action to the lesson admin page, plus an AI source badge in the resource manager; add Greek and English messages.
- Tests: unit tests for prompt/schema parsing and topic validation, integration tests for topic persistence and suggestion review flow, component tests for the new admin controls, and e2e coverage for the teacher flow.
- No new runtime dependencies and no outbound requests to proposed URLs.
