# Tasks

## 1. Service and API

- [x] 1.1 Add `lessonTitleSchema` (trimmed, non-empty, max 200 characters) and `updateLessonTitle` to `src/server/services/classes.ts`, returning the updated lesson and throwing `NotFoundError` for a missing lesson; verify with new cases in `tests/classes.integration.test.ts` run via `npm run test:integration -- tests/classes.integration.test.ts`.
- [x] 1.2 Add the `PATCH` handler for `{ title }` to `src/app/api/admin/lessons/[lessonId]/route.ts` using `withAdmin(..., { mutation: true })`; verify request-level tests cover success, trimming, blank/overlong 422 responses, unknown-lesson 404, unauthenticated denial, and that the original filename is unchanged.
- [x] 1.3 Add an integration assertion that `loadLessonForStudent` returns the edited title after a rename; verify it passes with the same integration test command.

## 2. Admin UI and localization

- [x] 2.1 Create a `LessonTitleEditor` client component that renders the current title with an edit action, switches to an input with Save/Cancel, disables controls while pending, and displays a localized failure message; verify it compiles with `npm run typecheck`.
- [x] 2.2 Replace the static `<h1>` in `src/app/[locale]/admin/lessons/[lessonId]/page.tsx` with the editor and refresh the page after a successful save; verify the detail page still renders the lesson title and exposes the edit control.
- [x] 2.3 Add the edit/save/success/failure/required-title keys to the `admin` namespace in both `messages/en.json` and `messages/el.json`; verify with `npx vitest run tests/messages.test.ts`.
- [x] 2.4 Extend `e2e/classes.spec.ts` to rename the demo lesson, assert the new heading in the admin detail page and persisted title from the admin API, reload, and restore the original title; verify with `npm run test:e2e -- e2e/classes.spec.ts` against a running app.

## 3. Integration verification

- [x] 3.1 Run `npm run typecheck` and `npm run lint`; fix any type or lint failures introduced by the change.
- [x] 3.2 Run `npm test` and the targeted integration suites for classes and student data; confirm no regressions.
- [x] 3.3 Run `openspec validate add-editable-lesson-title --strict`; confirm the change validates with the new `class-management` delta.

## Workflow follow-up

- Archive the change after implementation and review are complete.
- Verify the archived spec and change status.
