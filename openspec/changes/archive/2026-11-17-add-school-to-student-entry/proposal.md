# Proposal

## Why

Students identify themselves only by display name when they open a share link. Teachers cannot tell which school a quiz or game attempt came from, and duplicate or common names become ambiguous across shared links. Collecting the school at student entry gives every attempt a usable context without adding accounts.

## What Changes

- **Add a required School field to student entry.** The share-link entry screen asks for the school name in a text field placed directly above the existing "What is your name?" field. A blank school is rejected; the value is trimmed, whitespace-collapsed, and limited to 120 characters.
- **Carry the school through the student session.** The signed student session gains the school, and a long-lived `student_school` cookie pre-fills it on return visits, mirroring how the student name is remembered. Sessions without a school are treated as incomplete and return the student to the entry form.
- **Persist the school on every assessment attempt.** Questionnaire and game attempts store the school supplied at entry, and the school is copied into each new attempt rather than re-asked before each quiz.
- **Show the school to teachers.** The lesson results attempt table gains a School column, and both lesson and class CSV exports include a `school` column.
- **Update Greek and English copy** for the school label, placeholder, and validation error.
- **Add a database migration** for `Attempt.studentSchool`, defaulting existing rows to an empty string.

### Assumptions

- The school is free text; there is no canonical school directory, autocomplete, or per-class school setting.
- The school is asked once per student session, above the name field, and applies to every lesson opened through that session.
- The school is stored per attempt. Changing it later affects new attempts only and does not rewrite past attempts.
- The class overview's per-student aggregate stays name-only; school is shown per attempt in lesson results and in both CSV exports.
- Existing sessions and cookies created before this change lack a school and are invalidated, so returning students re-enter both fields once.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `student-experience`: student entry now requires a school text field above the name field, and the stored school is remembered for return visits.
- `assessment-results`: attempts persist the school, the teacher lesson dashboard and CSV exports show it, and the minimal-personal-data requirement includes it.

## Impact

- **Code**: `src/lib/names.ts` or a new school validation helper, `src/server/auth/student.ts`, `src/app/api/s/[token]/session/route.ts`, `src/app/[locale]/s/[token]/page.tsx`, `src/components/student/name-entry-form.tsx`, `src/server/student/game.ts`, `src/server/student/questionnaire.ts`, both student start/submit routes, `src/server/repositories/attempts.ts`, `src/server/services/results.ts`, the lesson results page, and the lesson/class CSV exporters.
- **Database**: add `Attempt.studentSchool` (string, default `""`) via Prisma migration; existing rows remain readable.
- **API**: the student session `POST /api/s/[token]/session` body becomes `{ name, school }`; requests without a school are rejected with 422. **BREAKING** for any direct caller of that internal route.
- **i18n**: `messages/en.json` and `messages/el.json` gain school labels, placeholder, and validation copy; results copy gains a School column label.
- **Tests**: school validation, session round-trip and cookie prefill, attempt persistence, results table data, CSV columns, and the entry form.
- **Out of scope**: accounts, school directories, school-level analytics, changing class results aggregation, and editing schools on past attempts.
