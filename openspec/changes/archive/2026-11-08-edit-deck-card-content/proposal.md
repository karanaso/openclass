# Proposal

## Why

Teachers currently have no way to correct generated deck content. A hallucinated fact, typo, or awkward translation forces them to regenerate the entire lesson, which replaces unrelated cards and costs another AI call. Teachers need to fix an individual card quickly, in both languages, without touching the rest of the lesson.

## What Changes

- Add a card editor to the teacher's lesson detail page that lists the lesson's published deck cards and lets the teacher edit each card's prompt and answer in Greek and English.
- Add an admin API that validates and saves the Greek and English text for a single existing card on a lesson, scoped to that lesson.
- Require both locale variants in a save so a card never ends up with one language updated and the other stale; reject blank prompt or answer text.
- Allow editing only when the lesson's deck is published (`READY`); reject saves while the lesson is processing or failed.
- Show the saved content to students on their next deck load; no student-side editing is introduced.
- Keep questionnaire, game, narration, and video content unchanged by card edits.
- Regeneration still replaces the whole deck: manual card edits are discarded when the teacher regenerates, and the editor warns about that.

## Capabilities

### New Capabilities

- `card-editing`: Teacher-facing editing of existing deck card prompt and answer content in both locales, with validation, persistence, and access control.

### Modified Capabilities

<!-- None: student card presentation, generation, and publication requirements are unchanged. -->

## Impact

- `prisma/schema.prisma`: no schema change expected; existing `Card` and `CardTranslation` models already store per-locale prompt and answer.
- `src/server/services`: new card-editing service with validation, listing, and lesson/card scoping.
- `src/app/api/admin/lessons/[lessonId]/cards/[cardId]/route.ts`: new authenticated update endpoint.
- `src/app/[locale]/admin/lessons/[lessonId]/page.tsx`: load cards for the editor.
- `src/components/admin`: new client card editor component.
- `messages/el.json`, `messages/en.json`: new admin UI strings.
- Tests: service/API integration coverage and an admin end-to-end edit flow.
