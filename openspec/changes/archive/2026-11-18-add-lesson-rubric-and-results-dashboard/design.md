# Design

## Context

See `proposal.md` for motivation. The current pipeline generates cards, questionnaire, and game content through `ContentProvider`, then publishes them atomically. Lessons already store AI-generated bilingual topics, and the teacher lesson results page already exposes attempts plus aggregate and per-question statistics. The student lesson UI builds tabs from published content, and the quiz result screen is independent of any additional rubric.

This change adds a second AI-generated, teacher-editable artifact to the lesson and enriches the existing results surface. It does not add a second grading workflow or a duplicate dashboard page.

## Goals / Non-Goals

**Goals:**

- Produce a small bilingual rubric (criteria plus performance levels) without reducing lesson-generation reliability.
- Let the teacher fully curate the rubric while preserving that curation across regeneration.
- Show students a localized, read-only rubric in a tab after Quiz.
- Enrich the existing lesson results page with distribution, mode, unique-student, and per-student views.

**Non-Goals:**

- Scoring students against the rubric or storing rubric levels per attempt.
- A full criteria-by-level descriptor matrix; the rubric is a list of criteria and a separate list of performance levels.
- A new dashboard page or changes to the class results page.
- Changing quiz scoring, pass thresholds, attempt persistence, or result privacy.

## Decisions

### 1. Store the rubric as bounded JSON on `Lesson`

Add `rubric Json?` with the shape `{ criteria: [{ id, title: {el,en}, description: {el,en} }], levels: [{ id, label: {el,en}, description: {el,en} }] }` and `rubricEdited Boolean @default(false)`. A dedicated criteria/levels table would add joins and per-row CRUD for content that is always replaced as a whole. The shape is validated through a shared `lib/rubric.ts` module with limits: 3–6 criteria, 3–4 levels, 80-character titles/labels, 500-character descriptions, and unique IDs.

Alternative considered: relational `RubricCriterion` and `RubricLevel` tables mirroring card translations. Rejected because teacher edits are full-rubric saves, the item counts are small, and the tab reads the rubric as one object.

### 2. Generate the rubric once per lesson, best-effort, after questionnaire generation

Add `rubric(input)` to `ContentProvider`. The input contains the lesson pages, source locale, topics, and the generated questionnaire prompts so criteria align with what the assessment actually measures. The orchestrator calls it after the chunk loop has produced questionnaire items and before artifact validation/publication. Errors, timeouts, or unusable responses are logged and treated as no rubric; cards, questions, and the game still publish.

When `rubricEdited` is true, the provider call is skipped and the stored rubric is preserved. Otherwise the generated rubric is passed through normalization and published in the same transaction as the other artifacts. If the overall generation fails, nothing is published, so a failed attempt cannot partially replace an existing rubric.

Alternative considered: generating the rubric on demand from the admin page. Rejected because every lesson should have a rubric by default and the existing generation pipeline already has the lesson context.

### 3. Reuse the provider and publication patterns

The mock provider produces deterministic criteria from lesson sentences and fixed level labels/descriptions. The OpenAI provider uses a strict JSON schema. A `PROMPT_VERSION` bump records the change. Response schemas remain permissive enough for normalization to discard individual invalid criteria or levels, rather than rejecting the whole generation attempt. The mock provider lets e2e tests exercise rubric rendering without external calls.

### 4. Use a dedicated rubric service and admin route

`src/server/services/rubric.ts` reads and replaces a lesson's rubric, validates it, and sets `rubricEdited: true` on save. A `PATCH /api/admin/lessons/[lessonId]/rubric` route uses `withAdmin(..., { mutation: true })` to enforce teacher authentication and same-origin mutations. Clearing the rubric is allowed and leads to an empty rubric, which hides the student tab.

`LessonRubricEditor` sits with the lesson admin controls. It edits both locales, supports adding/removing criteria and levels, and displays validation errors without discarding the draft. This is intentionally a list editor, not a spreadsheet-style matrix editor; the representation keeps editing small enough to be usable on the existing admin page.

### 5. Localize the rubric into student data and add the tab

`loadLessonForStudent` reads the stored rubric, picks the selected locale with the existing translation fallback pattern, and returns a `StudentRubric` object containing localized criterion and level text plus a fallback flag. The rubric is not exposed in the attempt or result payloads beyond display text.

`LessonTabs` adds `rubric` to the tab order after `quiz`, with availability based on non-empty criteria and levels. The new `LessonRubric` component renders criteria, performance levels, an explicit "guidance, not a grade" note, and the existing locale-fallback notice. The quiz result and submission flow remain untouched.

### 6. Enrich the existing results service and page

`getLessonResults` adds:
- `uniqueStudents`: distinct normalized student names among completed attempts.
- `scoreDistribution`: fixed bands `0–20`, `21–40`, `41–60`, `61–80`, `81–100` with attempt counts.
- `modeStats`: questionnaire and game attempt counts and averages.
- `students`: per-student completed attempt count, best percentage, average percentage, and latest completion time.

The page adds summary cards for unique students and mode counts, a score-distribution bar list, and a per-student table, while keeping the existing attempt table, per-question insight, export, and deletion controls. All calculations use completed attempts only, matching current behavior. Empty lessons keep the existing empty-state rule instead of rendering zero-valued charts.

Alternative considered: adding a separate dashboard route. Rejected because the current page already owns lesson analytics and duplicating it would split maintenance and navigation.

### 7. Additive database migration

The migration adds a nullable `rubric` JSONB column and a non-null `rubricEdited` boolean defaulting to false. Existing lessons read as having no rubric and can be populated by regeneration or teacher editing. Rolling back code leaves the additive columns harmless.

## Risks / Trade-offs

- **AI criteria may be generic or weakly tied to the quiz** → The prompt includes questionnaire prompts and lesson text, and the teacher can edit every criterion and level.
- **Teacher edits could be overwritten on regeneration** → `rubricEdited` suppresses AI replacement after the teacher saves.
- **Rubric generation adds latency and token cost** → One bounded call per generation; skipped when edited; failures are non-blocking.
- **Empty or partial rubric** → Normalization drops invalid items; a rubric without enough valid content is treated as absent and the student tab is hidden.
- **Small cohorts make dashboard stats misleading** → The dashboard shows counts and distributions rather than inferential claims; existing empty-state behavior remains.
- **Dashboard computation grows with attempts** → The query already loads completed attempts for the page; the new aggregates are derived from the same set without additional queries.
- **Locale fallback on the rubric** → Use the existing `pickTranslation`-style fallback and reuse the existing fallback notice so students know when the primary locale is shown.

## Migration Plan

1. Add the `rubric` and `rubricEdited` fields and generate the migration.
2. Deploy the migration, then code that reads/writes rubrics.
3. Existing lessons have no rubric; teachers can edit them or regenerate the lesson to generate one.
4. Rollback: revert application code; the nullable column and boolean default require no destructive rollback.

## Open Questions

None that affect the specs, approach, or task breakdown.
