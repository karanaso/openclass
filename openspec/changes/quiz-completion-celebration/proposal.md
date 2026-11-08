# Proposal

## Why

Finishing the assessment quiz currently lands the student on a static score card that only shows their own result. It gives no sense of achievement at the moment of completion and no context for how their score compares with the class, which limits motivation and makes the result harder to interpret.

## What Changes

- Play a celebratory "tada"/confetti-style animation when a questionnaire submission completes, every time, while respecting reduced-motion preferences.
- Extend the questionnaire result with a class comparison for the same lesson: aggregate statistics (submitted count, average, highest, lowest) and an anonymized score distribution that includes the student's own score.
- Keep all class comparison data aggregate-only: never expose other students' names, individual scores, answers, or any data that can be tied to a specific student.
- Suppress the class comparison when the lesson has too few completed attempts to remain anonymous, showing a short "not enough results yet" state instead.
- Load the same class comparison when a student revisits a completed result, not only right after submission.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `questionnaire`: Add a completion celebration requirement and a class score summary on the graded result, including the anonymity and reduced-motion behavior.
- `assessment-results`: Amend the student result privacy requirement so a student may receive aggregate, anonymized class statistics for the same lesson, and add the class comparison requirement.

## Impact

- Student quiz UI: `src/components/student/questionnaire.tsx`, with new localization strings in `messages/en.json` and `messages/el.json`.
- Questionnaire grading payload: `src/server/student/questionnaire.ts` and `src/server/student/lesson-data.ts` gain an aggregate class summary for the lesson.
- Data access: `src/server/repositories/attempts.ts` (or the results service) gains a read-only aggregate query over completed questionnaire attempts.
- Existing submit API response gains the class summary; no new mutation or schema migration is expected.
- Integration tests for questionnaire grading, result privacy, and the student experience; end-to-end coverage for the completion animation and result summary.
