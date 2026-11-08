# Design

## Context

See `proposal.md` - Why. The questionnaire result currently comes from `submitQuestionnaire` / `buildQuestionnaireResult` and is also reconstructed on page load in `loadLessonForStudent`. The result UI in `src/components/student/questionnaire.tsx` renders a static score card plus per-item feedback. Framer Motion and the lesson's reduced-motion pattern are already available; no new dependency is needed.

## Goals / Non-Goals

**Goals:**

- Add a reusable aggregate class-summary read that both the submit response and the revisited-result page can use.
- Keep the summary privacy-safe by construction: aggregate values only, no per-student rows in the response.
- Make the celebration accessible and reduced-motion aware without changing the existing result information.

**Non-Goals:**

- No teacher-facing reporting changes; `getLessonResults` and `getClassResults` keep their current shapes.
- No named leaderboard, ranking list, or per-student score exposure.
- No sound effect for questionnaire completion.
- No database migration.

## Decisions

### Class summary lives beside questionnaire grading, not in the teacher results service

Add `src/server/student/class-summary.ts` exporting `getLessonQuestionnaireSummary(lessonId, currentPercentage, db)`. It calls a new repository reader in `src/server/repositories/attempts.ts` that selects only `percentage` for completed `QUESTIONNAIRE` attempts of the lesson. This avoids coupling the student flow to `src/server/services/results.ts`, whose shapes are teacher-oriented, and avoids a circular import between `lesson-data.ts` and `questionnaire.ts`.

Alternative: reuse `getLessonResults`, but it loads answers, questions, translations, and deck views that the student summary does not need, and it exposes more data than necessary.

### Compute statistics in application code from percentages

The dataset is one class-lesson and the query uses the existing `[lessonId, completedAt]` index. Fetching percentages and computing count, average, min, max, and 20-point bands is simpler to test than Prisma aggregate plus group-by, and avoids raw SQL for banding.

Distribution bands: `0-19`, `20-39`, `40-59`, `60-79`, `80-100`. The summary marks the band containing the current result so the UI can highlight the student's position without exposing anyone else's value.

### Suppress the summary below three completed attempts

Return `null` when the lesson has fewer than three completed questionnaire attempts. This prevents a classmate from deriving another student's score from count + average + high/low in very small cohorts, and gives the UI a clear "not enough results yet" state. The threshold is a named constant and can be tuned later.

Alternative: always show aggregate values. Rejected because with two attempts the average plus the student's own score reveals the other score.

### Extend the existing result payload instead of adding a fetch

`QuestionnaireResult` gains `classSummary: ClassSummary | null`. `submitQuestionnaire` and `loadLessonForStudent` both populate it, so the submit response and the server-rendered result stay consistent with no extra network request and no new route.

### Celebrate in a small client component, keyed to the result view

Add `src/components/student/quiz-celebration.tsx`, rendered by `Questionnaire` only after a fresh successful submission (including retakes), not on a page-load of an old result. It uses Framer Motion with a deterministic particle array (no `Math.random`) and `useReducedMotion()`. With reduced motion it renders the static celebratory label and no moving particles. The animation is presentational, `aria-hidden`, `pointer-events-none`, and self-clears after it plays.

## Risks / Trade-offs

- **Small-class inference** → Suppress below three attempts and expose only bands, not exact scores or names.
- **Retakes skew the class average** → Documented behavior: every completed attempt counts, matching the approved scope.
- **Animation distracts or harms motion-sensitive students** → Honor `prefers-reduced-motion` and keep the static result fully readable.
- **Class summary query grows with attempts** → The query is indexed and selects one integer column; class scale is expected to stay small.
- **Existing result payload consumers** → The new field is additive and optional (`classSummary: ClassSummary | null`); current consumers ignore it.

## Migration Plan

No schema or data migration. Deploy the additive payload and UI together; rollback is a code revert. Existing attempts immediately participate in summaries because the query reads stored completed attempts.
