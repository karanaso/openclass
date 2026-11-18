# Tasks

## 1. Data model and backfill migration

- [x] 1.1 Add `accessCode String @unique` to the `Lesson` model in `prisma/schema.prisma`, generate a create-only migration, and hand-edit its SQL to add the column nullable, create the unique index, backfill every lesson with a random unique 9-digit value in a retry loop, then set the column `NOT NULL`.
- [x] 1.2 Apply the migration to a test database seeded with lessons, then verify with SQL that the row count equals the count of distinct `accessCode` values, every value matches `^[1-9][0-9]{8}$`, and `prisma migrate diff` reports no drift.

## 2. Access-code generation and lesson assignment

- [x] 2.1 Add `src/lib/lesson-code.ts` with the shared format check (`^[1-9]\d{8}$`) and `src/server/services/lesson-access-codes.ts` with `newLessonAccessCode`, `assignAccessCode` (pre-check plus bounded retry), and `regenerateAccessCode` (P2002 retry); verify with unit tests for range, 9-digit format, taken-number retry, exhausted attempts, and regeneration.
- [x] 2.2 Assign a code inside the existing lesson creation in `src/server/services/ingestion.ts`, passing it to `db.lesson.create` and retrying the create on an `accessCode` unique conflict without breaking the storage cleanup path; verify with an integration upload test that each accepted lesson has a unique 9-digit code and rejected/duplicate uploads leave no orphan lesson.

## 3. Student resolution, session flow, and throttling

- [x] 3.1 Add `resolveStudentAccess(identifier)` that resolves a 9-digit identifier to its lesson and otherwise delegates to the existing share-token resolution, keeping revocation and expiry errors unchanged; make the landing page, lesson page, `requireStudentContext`, `assertLessonInShare`, and `/api/s/[token]/session` use it; verify with integration tests for a valid numeric URL, unknown numeric URL, numeric lesson access, session scoping to one number, and unchanged token-link behavior.
- [x] 3.2 Add code-lookup throttling to `src/server/auth/rate-limit.ts` (`assertCodeLookupAllowed`, `recordCodeFailure`, `clearCodeFailures`) plus `LESSON_CODE_MAX_FAILURES=5` and `LESSON_CODE_LOCKOUT_SECONDS=30` in `src/lib/env.ts`; verify with unit tests that the fifth failure locks, a valid lookup during lockout is rejected, the lock reports its remaining TTL, the lock expires, and success clears the counter.
- [x] 3.3 Apply the throttle to numeric URL page loads and record misses there, so typing a number directly cannot bypass the home-form limit; verify with an integration/page test that repeated unknown numeric URLs trigger the lockout and a valid number is blocked until the window ends.

## 4. Home-screen number entry

- [x] 4.1 Add `POST /api/s/code` (`withPublic`) that validates the 9-digit shape, enforces the throttle, resolves the code, clears failures on success, and returns `{ lessonId }`, `404 code_not_found`, or `429 code_rate_limited` with `retryAfter`; verify with route tests for malformed input, success, not-found, lockout, and counter reset.
- [x] 4.2 Build `src/components/student/access-code-entry.tsx` and render it on `src/app/[locale]/page.tsx` with a numeric 9-digit input, digit filtering, localized submit and errors, and a live lockout countdown that re-enables the form; verify with component tests for input filtering, successful navigation, not-found message, disabled state during lockout, and re-enable after the countdown.
- [x] 4.3 Add the matching `home` and `errors` keys to `messages/el.json` and `messages/en.json`; verify `tests/messages.test.ts` parity still passes.
- [x] 4.4 Create `docs/access-codes.md` describing the student home entry, numeric URL format, and lockout behavior; verify the documented URLs and limits match the implementation.

## 5. Teacher display and regeneration

- [x] 5.1 Add `POST /api/admin/lessons/[lessonId]/access-code` using `withAdmin(..., { mutation: true })` and the regeneration service; verify with integration tests for unauthenticated rejection, cross-origin rejection, a successful new code, the previous code no longer resolving, and other lessons keeping their codes.
- [x] 5.2 Build `src/components/admin/lesson-access-code.tsx` with the monospace code display, a round icon refresh button and accessible label, a confirmation that the old number stops working, success/error feedback, and `router.refresh()`; wire it into the lesson detail header and include `accessCode` in the lesson detail data; verify with component tests and a page render check.
- [x] 5.3 Add the matching `admin` keys to `messages/el.json` and `messages/en.json`; verify message parity and that both locales render the label, confirmation, and feedback.
- [x] 5.4 Extend `docs/access-codes.md` with the teacher display, regeneration warning, and the two throttle environment variables; verify the documented behavior matches the admin page.

## 6. End-to-end verification

- [x] 6.1 Add `e2e/lesson-access-codes.spec.ts` covering a teacher viewing and regenerating a lesson number, a student entering the number on the home screen, completing name/school entry, and reaching the lesson tabs; optionally check an unknown number and the lockout message.
- [x] 6.2 Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, and `npm run test:e2e`; resolve failures and confirm all suites pass.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied and the implementation is merged.
- Verify the archived specs contain the new `lesson-access-codes` capability and the updated `student-experience` requirements.
