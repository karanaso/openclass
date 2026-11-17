# Design

## Context

See `proposal.md` for motivation. Today the student flow is:

- `src/app/[locale]/s/[token]/page.tsx` renders `NameEntryForm` when the current session does not match the share token.
- `POST /api/s/[token]/session` validates `{ name }`, signs a student JWT (`name`, `normalizedName`, `tokenHash`), and sets `student_session` plus a long-lived `student_name` cookie.
- `startGame` and `submitQuestionnaire` receive the student name from the session and write `Attempt` rows; results read from those rows.

The existing validation helpers live in `src/lib/names.ts`, and result rows/exports are shaped in `src/server/services/results.ts`.

## Goals / Non-Goals

**Goals:**

- Collect a required school above the name field at student entry.
- Carry the school in the session and pre-fill it on return visits.
- Store the school on every new questionnaire and game attempt.
- Show the school in lesson results and lesson/class CSV exports.
- Keep existing attempts readable after an additive migration.

**Non-Goals:**

- A school directory, autocomplete, or canonicalization.
- Per-class school configuration or school-level analytics.
- Editing the school on historical attempts.
- Changing how per-student class aggregates are keyed (`normalizedStudentName`).

## Decisions

### 1. Extend the student session and cookies

Add `school` to the student JWT payload and verify it as a required string. Add `STUDENT_SCHOOL_COOKIE` with the same one-year lifetime and options as `student_name`, plus `getStoredStudentSchool()`.

The session route accepts `{ name, school }`, validates both, signs the school into the session, and sets the school cookie. `DELETE` clears all three cookies.

Because old session tokens have no `school`, verification returns `null` for them. That intentionally invalidates pre-change sessions so every student supplies a school once; the long-lived name cookie still pre-fills the name, and the school starts blank.

Alternative: store the school in a new `StudentProfile` table keyed by normalized name. Rejected because the product is account-free, names are not unique, and attempts already carry the name they were created with.

### 2. Validate the school as bounded free text

Add `displaySchoolName()` and `isValidSchoolName()` next to the name helpers:

- NFKC-normalize, trim, and collapse internal whitespace for display/storage.
- Require at least one character and at most 120 characters.
- Do not case-fold the stored value; school display names should keep their casing.

The entry form enforces `required` and `maxLength={120}`. The session route validates again and returns `422 invalid_school` with the message "Enter a school of up to 120 characters". The form maps that code to a school-specific inline error and keeps name errors separate.

Alternative: reuse the 80-character name limit. Rejected because official school names are often longer, and the name limit exists for display columns, not school text.

### 3. Store the school on attempts, not in a new identity table

Add `Attempt.studentSchool String @default("")` and pass the session school through:

`session.school` → start/submit route → `startGame` / `submitQuestionnaire` → `createAttempt` or the game's attempt insert.

The default keeps the migration additive and leaves historical attempts readable with an empty school. New attempts always receive a non-empty school because the session requires one. Changing the school later affects only attempts created after the change, which matches the per-attempt snapshot model already used for the student name.

Alternative: a normalized school id table. Rejected as unnecessary for a free-text field with no reporting requirements beyond display/export.

### 4. Surface the school in teacher results and exports

- Add `studentSchool` to `AttemptRow` and populate it in `getLessonResults`.
- Add a School column to the lesson results attempt table.
- Add `school` to `exportLessonCsv` and `exportClassCsv` row objects and column lists.
- Add `results.school` copy in both locales.

The class overview's per-student aggregate stays name-only: one student may have attempts with different school values, so a single school cell would be ambiguous. The class CSV shows the school per attempt instead.

### 5. Entry form layout and error behavior

Render the school field first, directly above the name field, and move `autoFocus` to it so the first thing a student types is the school. Submit `{ name, school }`.

On a non-OK response, read the JSON error code: `invalid_school` and `invalid_name` show their specific messages, and anything else falls back to the existing generic error.

## Risks / Trade-offs

- **Existing sessions are invalidated** → Returning students must re-enter the school once. The name remains pre-filled, and the session TTL is only seven days.
- **Free text is hard to analyze** → The field is for context and display, not grouping. If school-level reporting is needed later, add a separate capability rather than overloading this string.
- **Existing attempts have no school** → The column and CSV cells are empty for pre-change rows. This is visible but not misleading, and avoids inventing data.
- **Extra personal data** → The school is only visible to authenticated teachers through existing result and export routes; student-facing statistics remain non-identifying.
- **Mobile layout** → Two stacked fields fit the existing card layout; keep labels short and test the narrow viewport.

## Migration Plan

1. Add `Attempt.studentSchool` with default `""` and run `prisma migrate deploy`.
2. Deploy validation, session, attempt, results, and UI changes together so the session contract and readers stay aligned.
3. Rollback: deploy the previous code; the additive column remains unused. Existing sessions without a school are rejected, so users simply re-enter after rollback.
