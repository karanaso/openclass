# Tasks

## 1. Data model and rubric primitives

- [x] 1.1 Add `rubric Json?` and `rubricEdited Boolean @default(false)` to `Lesson` in `prisma/schema.prisma`; create the migration with `npx prisma migrate dev --name add_lesson_rubric`. Verify with `npx prisma validate`, `npx prisma generate`, and by reading the migration SQL to confirm the nullable JSON column and boolean default.
- [x] 1.2 Create `src/lib/rubric.ts` with the rubric types, limits, normalization, and validation helpers for criteria and levels, including stable IDs, bilingual text, count bounds, length bounds, and duplicate rejection. Verify with `tests/rubric.test.ts` covering valid, oversized, duplicate, empty, and malformed input via `npm test -- rubric`.

## 2. Rubric generation pipeline

- [x] 2.1 Add the rubric response schema and TypeScript types to `src/server/generation/schemas.ts`, allowing per-item rejection during normalization. Verify with schema tests in `tests/generation.test.ts` for valid and malformed rubric payloads.
- [x] 2.2 Extend `ContentProvider` with `rubric(input)` and add `buildRubricPrompt`, using lesson pages, topics, and generated questionnaire prompts, then bump `PROMPT_VERSION`. Verify with prompt tests that the rubric request is bilingual, source-grounded, assessment-aligned, and excludes student data.
- [x] 2.3 Implement deterministic `rubric` output in `MockContentProvider` with criteria derived from lesson content and fixed bilingual level labels. Verify with tests that output is repeatable, respects limits, and satisfies the `ContentProvider` interface.
- [x] 2.4 Implement `rubric` in `OpenAIContentProvider` with a strict JSON schema name and the new prompt builder. Verify with a test that stubs `fetch` and asserts the request schema name and parsed response.
- [x] 2.5 Integrate rubric generation into `generateLessonContent` after questionnaire generation, skip the call when `rubricEdited` is true, and publish the rubric in the same transaction as cards/questions. Verify with `tests/generation.integration.test.ts` for successful persistence, non-blocking provider failure, and preservation of edited rubrics across regeneration.
- [x] 2.6 Update `docs/generation.md` for the new prompt version, rubric generation, best-effort behavior, and teacher-edit preservation. Verify the documented pipeline and contract match the implemented code.

## 3. Teacher rubric editing

- [x] 3.1 Create `src/server/services/rubric.ts` with `getLessonRubric` and `updateLessonRubric`, validating and normalizing the full rubric and setting `rubricEdited: true`. Verify with an integration test that saves, rejects invalid input, and clears a rubric.
- [x] 3.2 Add `PATCH /api/admin/lessons/[lessonId]/rubric` using `withAdmin(..., { mutation: true })`. Verify with integration tests for authenticated save, unauthenticated denial, cross-origin rejection, and validation errors that leave the stored rubric unchanged.
- [x] 3.3 Build `LessonRubricEditor` with bilingual criterion and level fields, add/remove controls, save status, empty state, and validation feedback. Verify with `tests/lesson-rubric-editor.test.tsx` covering add, remove, save success, save failure, and clear.
- [x] 3.4 Render the rubric editor on the lesson admin page using the stored rubric, positioned with the lesson editing controls. Verify with `npm run typecheck` and a manual page load for lessons with and without rubrics.
- [x] 3.5 Add all teacher rubric labels and validation messages to `messages/el.json` and `messages/en.json`. Verify with `tests/messages.test.ts` and by switching the interface language on the editor.

## 4. Student rubric tab

- [x] 4.1 Extend `loadLessonForStudent` to return a localized student rubric with the existing primary-locale fallback and without exposing teacher-only fields. Verify with `tests/student.integration.test.ts` for localized output, fallback behavior, and lessons without a rubric.
- [x] 4.2 Build `LessonRubric` to render criteria and performance levels, show a clear informational-only note, and expose the fallback notice when needed. Verify with `tests/lesson-rubric.test.tsx` for localized rendering, informational text, and fallback display.
- [x] 4.3 Add the Rubric tab after Quiz in `LessonTabs`, making it available only when the rubric has criteria and levels and supporting direct tab links. Verify with `tests/lesson-tabs.test.tsx` for tab order, availability, direct links, and lessons without a rubric.
- [x] 4.4 Add all student rubric labels to `messages/el.json` and `messages/en.json`. Verify with `tests/messages.test.ts` and both locale renders.

## 5. Enhanced lesson results dashboard

- [x] 5.1 Extend `getLessonResults` with unique-student count, score-band distribution, questionnaire/game mode statistics, and per-student best/average/latest values, using completed attempts only. Verify with `tests/results.integration.test.ts` for counting, band boundaries, mode splits, student aggregation, and exclusion of incomplete attempts.
- [x] 5.2 Add summary cards, a score-distribution visualization, and a per-student performance table to the existing lesson results page while keeping attempts, per-question insight, export, and deletion behavior. Verify with `npm run typecheck` and the results integration/e2e flows.
- [x] 5.3 Add the new results labels to `messages/el.json` and `messages/en.json`. Verify with `tests/messages.test.ts` and by loading the results page in both locales.

## 6. Integration and verification

- [x] 6.1 Add `e2e/lesson-rubric-and-results.spec.ts` covering the teacher editing a rubric, a student opening the Rubric tab after Quiz, and the teacher seeing the enriched dashboard statistics. Verify with `AI_PROVIDER=mock npx playwright test e2e/lesson-rubric-and-results.spec.ts`.
- [x] 6.2 Update the README feature list and relevant results/generation documentation for the rubric and dashboard additions. Verify the rendered documentation mentions the informational rubric and enhanced lesson results.
- [x] 6.3 Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, and `AI_PROVIDER=mock npm run test:e2e`; resolve any failures introduced by the rubric, tab, or dashboard work.
- [x] 6.4 Apply `npx prisma migrate deploy` against a clean database and verify a lesson can generate a rubric, save a teacher edit, show the student Rubric tab, and populate the enhanced dashboard from a completed attempt.

## Workflow follow-up

- Archive the change and sync the accepted `lesson-rubric`, `student-experience`, and `assessment-results` deltas after review and verification.
