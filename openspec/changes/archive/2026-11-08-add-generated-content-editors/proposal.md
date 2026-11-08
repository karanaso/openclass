# Proposal

## Why

Teachers can currently fix card text only by scrolling to a separate, always-visible editor, and they have no way to correct or add questionnaire or game questions after generation. Fixing a bad distractor, explanation, or missing question requires regenerating the whole lesson, which discards existing manual edits and replaces every artifact. The lesson detail page's "Generated content" card should become the place where a teacher opens editors for cards and questions, edits them, adds missing items, and saves—without regenerating the lesson.

## What Changes

- Add two actions next to the "Generated content" card title: one opens the Cards editor and one opens the Questions editor.
- Keep card creation in scope: teachers can add a card (Greek and English prompt and answer, source page) in addition to editing existing cards. New cards append to the deck.
- Add a Questions editor covering questionnaire questions and game questions as separate sections. Teachers can edit a question's bilingual prompt, options, explanation, correct option, and source page, and can add a new question to either mode.
- Validate all saves atomically: both locales required, exact option counts per question type (two for true/false, four for multiple choice), option ids aligned across locales, correct option present, and lesson `READY`.
- Reuse the existing authenticated admin mutation pattern and the existing `Card`/`CardTranslation` and `Question`/`QuestionTranslation` storage. No database migration is required.
- Keep regeneration behavior unchanged: it still replaces cards and questions wholesale and discards manual edits; the editors state this.

## Capabilities

### New Capabilities

- `question-editing`: Teacher-only browsing, editing, and creation of questionnaire and game questions in both locales, with validated atomic saves and student visibility on next load.

### Modified Capabilities

- `card-editing`: Adds card creation and makes the card editor available from an edit action on the "Generated content" card, alongside the existing per-card bilingual update behavior.

## Impact

- **UI**: `src/app/[locale]/admin/lessons/[lessonId]/page.tsx`, `src/components/admin/card-editor.tsx`, a new question editor component, and `messages/el.json` / `messages/en.json`.
- **API**: New admin `POST /api/admin/lessons/[lessonId]/cards`, `POST /api/admin/lessons/[lessonId]/questions`, and `PATCH /api/admin/lessons/[lessonId]/questions/[questionId]` routes; existing card PATCH route unchanged.
- **Services**: Extend `src/server/services/cards.ts` with creation; add `src/server/services/questions.ts` for listing, creating, and updating questions.
- **Data**: No schema changes; `Question`, `QuestionTranslation`, `Card`, and `CardTranslation` already hold the required fields. `itemKey` uniqueness and `position` ordering are assigned server-side for new items.
- **Tests**: Unit tests for question validation/creation/update and card creation; an end-to-end flow for opening both editors, editing, creating, saving, and confirming student visibility.
- **Out of scope**: Deleting or reordering cards/questions, preserving edits across regeneration, question type/mode changes after creation, and audit history.
