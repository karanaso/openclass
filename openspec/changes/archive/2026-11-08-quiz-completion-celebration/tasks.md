# Tasks

## 1. Aggregate class summary

- [x] 1.1 Add a repository reader in `src/server/repositories/attempts.ts` that selects only `percentage` for completed `QUESTIONNAIRE` attempts of a lesson; verify with an integration test that drafts and incomplete attempts are excluded.
- [x] 1.2 Add `src/server/student/class-summary.ts` with `getLessonQuestionnaireSummary(lessonId, currentPercentage, db)` returning count, average, highest, lowest, five 20-point distribution bands, and the current band; return `null` below three attempts. Verify with integration tests for exact statistics, band mapping, retakes counted, and the small-cohort `null` case.
- [x] 1.3 Extend `QuestionnaireResult` in `src/server/student/lesson-data.ts` with `classSummary: ClassSummary | null` and populate it from `submitQuestionnaire` and `loadLessonForStudent`; verify the submit response and a server-loaded existing result both include the same aggregate values.
- [x] 1.4 Add privacy assertions in `tests/student.integration.test.ts` that the summary payload contains no student names, normalized names, attempt ids, answers, or per-student scores.

## 2. Result screen, celebration, and strings

- [x] 2.1 Add questionnaire result strings for class attempt count, average, highest, lowest, distribution, student position, not-enough-results state, and the celebration label to both `messages/en.json` and `messages/el.json`; verify `npm test -- tests/messages.test.ts` passes with identical key sets.
- [x] 2.2 Add a class comparison panel to `src/components/student/questionnaire.tsx` that renders the aggregate summary, highlights the current student's distribution band, and shows the not-enough-results state when `classSummary` is null; verify with a component or integration check using seeded attempts.
- [x] 2.3 Add `src/components/student/quiz-celebration.tsx` using Framer Motion, a deterministic particle array, `useReducedMotion()`, `aria-hidden`, and `pointer-events-none`; verify reduced motion renders no moving particles while the static celebration label remains.
- [x] 2.4 Trigger the celebration in `Questionnaire` only after a fresh successful submission, including a retake, not when loading an already-completed result; verify the retake path replays it and a page reload does not.
- [x] 2.5 Add stable test ids for the celebration and class summary, and extend `e2e/student.spec.ts` to assert the celebration appears after submit and the class summary shows the aggregate values without names.

## 3. Integration verification

- [x] 3.1 Run `npm run typecheck` and `npm test` and confirm they pass.
- [x] 3.2 Run `npm run test:e2e -- e2e/student.spec.ts` and confirm the quiz completion, celebration, and class summary flow passes.

## Workflow follow-up

- Archive the change after review and verification are complete.
