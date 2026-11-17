# Tasks

## 1. Data model and validation

- [x] 1.1 Add `studentSchool String @default("")` to `Attempt` in `prisma/schema.prisma` and create the migration; verify with `npx prisma validate` and `npx prisma migrate dev --name add_attempt_school`.
- [x] 1.2 Add `displaySchoolName` and `isValidSchoolName` (trim/collapse whitespace, 1–120 characters, keep casing) to `src/lib/names.ts`; add unit cases to `tests/names.test.ts` for whitespace, empty, boundary, and oversized values and verify with `npx vitest run tests/names.test.ts`.

## 2. Student entry and session

- [x] 2.1 Add `school` to `StudentSession`, the JWT payload, and verification, invalidating tokens without a school; add `STUDENT_SCHOOL_COOKIE`, `studentSchoolCookieOptions`, and `getStoredStudentSchool`; verify the round-trip and missing-school rejection in `tests/student.integration.test.ts`.
- [x] 2.2 Update `POST /api/s/[token]/session` to require `{ name, school }`, validate the school as `invalid_school` on failure, sign it into the session, and set the school cookie; update `DELETE` to clear it. Verify accepted, blank, and oversized submissions plus cookie clearing in the student integration tests.
- [x] 2.3 Update the share landing page and `NameEntryForm` to render a required School field directly above the name field, pre-fill it from the session or stored cookie, and show school-specific validation errors; add `schoolLabel`, `schoolPlaceholder`, and `invalidSchool` copy to `messages/en.json` and `messages/el.json`. Verify with a component test that asserts field order, required/max-length attributes, and the posted `{ name, school }` body.

## 3. Attempt persistence

- [x] 3.1 Thread the school from the student session through the game start and questionnaire submit routes into `startGame`, `submitQuestionnaire`, and `createAttempt` (plus the direct game attempt insert), and add the required input to all existing call sites and fixtures. Verify the questionnaire and game integration tests assert the stored `studentSchool`.
- [x] 3.2 Confirm a school change affects only new attempts: verify with a test that submits an attempt, changes the session school, submits another attempt, and observes the two stored school values.

## 4. Teacher results and exports

- [x] 4.1 Add `studentSchool` to `AttemptRow` and populate it in `getLessonResults`; add a `school` column to `exportLessonCsv` and `exportClassCsv`. Verify the results integration tests assert the field, the escaped CSV header, and school values in both lesson and class exports.
- [x] 4.2 Add a School column to the lesson results attempt table and `results.school` copy in both locales; verify the rendered table shows the school for attempts with a value and a blank cell for legacy rows.

## 5. Integration verification

- [x] 5.1 Run `npm run typecheck`, `npm run lint`, and `npm test`; verify all exit successfully.
- [x] 5.2 Run `npm run test:integration`; verify the student session, attempt, results, and CSV suites pass with the additive migration.
- [x] 5.3 Exercise the student entry flow on a narrow viewport: verify the school field is above the name field, a blank school blocks entry, and the value survives a return visit.

## Workflow follow-up

- Run `openspec validate --strict "add-school-to-student-entry"`.
- Archive the change after implementation and review are complete.
