# Tasks

## 1. Card Creation Backend

- [x] 1.1 Extend `src/server/services/cards.ts` with a `createCardSchema` and `createCard(lessonId, input)` that requires both locales, validates a source page within the lesson, requires a `READY` lesson, assigns the next deck position, and generates a unique `manual-<uuid>` item key. Verify with new card creation cases in `tests/card-editing.integration.test.ts` covering success, blank content, out-of-range page, non-ready lesson, and append position.
- [x] 1.2 Add `POST /api/admin/lessons/[lessonId]/cards` using `withAdmin(..., { mutation: true })`, returning the saved card with `201`. Verify with integration tests that call the route with and without a teacher session and assert the persisted card and error statuses.

## 2. Question Service and API

- [x] 2.1 Add `src/server/services/questions.ts` with the editable question types, `listLessonQuestions`, and a strict update schema that rejects type/mode keys. Verify listing returns both modes in position order with both locale translations in a new integration test.
- [x] 2.2 Implement the type-aware content validator and `updateQuestion` transaction: exact option counts (two true/false, four multiple choice), aligned ids, present correct option, source page range, `READY` lesson, and lesson ownership. Verify integration tests reject blank content, wrong counts, misaligned ids, a missing correct option, a foreign question, and a non-ready lesson, and that a valid update writes both locales atomically.
- [x] 2.3 Implement `createQuestion` with mode and type, type-aware validation, next position within the mode, and a unique `manual-<uuid>` item key. Verify integration tests create questionnaire and game questions, append positions, and reject invalid content without inserting rows.
- [x] 2.4 Add `POST /api/admin/lessons/[lessonId]/questions` and `PATCH /api/admin/lessons/[lessonId]/questions/[questionId]` with `withAdmin(..., { mutation: true })`. Verify route-level integration tests cover authentication, success payloads, validation failures, and not-found responses.

## 3. Admin Editors

- [x] 3.1 Add the client `GeneratedContentEditorProvider`, `GeneratedContentActions`, and `GeneratedContentCounts` components so the two edit buttons toggle one editor at a time and counts update after creation. Verify with a jsdom component test that the edit buttons expose `aria-expanded`, open the matching editor, and close it again.
- [x] 3.2 Extend `src/components/admin/card-editor.tsx` with an "Add card" form that posts to the new route, validates required bilingual fields client-side, appends the returned card, and reports success or failure. Verify with a jsdom test that a created card appears in the list and the count callback fires.
- [x] 3.3 Add `src/components/admin/question-editor.tsx` with separate Questionnaire and Game sections, position-ordered editable accordions, read-only type/mode and option ids, bilingual prompt/options/explanation fields, source page, correct-option selection, and add-question forms using canonical ids. Verify with jsdom tests for rendering both sections, editing and saving a question, creating one per mode, and showing a validation error.
- [x] 3.4 Wire the lesson detail page to load questions, wrap the grid and editors in the provider, place the edit actions in the "Generated content" header, render the editors below the grid, and add all new English and Greek message keys. Verify with `npm run typecheck` and `npm test -- tests/messages.test.ts`.

## 4. End-to-End Verification

- [x] 4.1 Update `e2e/card-editing.spec.ts` to open the card editor through the new "Generated content" action and add coverage for creating a card that students see after reload. Verify with `npm run test:e2e -- e2e/card-editing.spec.ts`.
- [x] 4.2 Add `e2e/question-editing.spec.ts` covering login, opening the Questions editor, editing a questionnaire question, creating a game question, saving, reloading to confirm persistence, and a student seeing the edited questionnaire prompt. Verify with `npm run test:e2e -- e2e/question-editing.spec.ts`.
- [x] 4.3 Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, and `npm run test:e2e`; resolve regressions and confirm all suites pass.

## Workflow follow-up

- Archive the change after implementation and review are complete.
- Validate the archived specs with `openspec validate --specs`.
