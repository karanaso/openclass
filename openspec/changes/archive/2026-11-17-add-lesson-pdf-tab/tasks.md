# Tasks

## 1. Serve the lesson source document

- [x] 1.1 Extend `serveStoredMedia` in `src/server/media/serve-media.ts` to accept optional extra response headers (including `content-disposition`) and merge them into both 200 and 206 responses; verify with unit tests in `tests/storage.test.ts` or a new media test covering both status paths.
- [x] 1.2 Add `GET` handler at `src/app/api/s/[token]/lessons/[lessonId]/source/route.ts`: enforce `requireStudentContext`, call `assertLessonInShare`, load the lesson's `storageKey`, and stream `application/pdf` inline with a sanitized filename and range support; verify with an integration test that covers authorized 200, missing session 401, lesson outside the share 403, missing lesson/file 404, and a range request returning 206 with partial bytes.
- [x] 1.3 Ensure no storage path or bucket key appears in route responses or client payloads; verify by asserting the response body/headers and generated URL contain only the share token, lesson id, and the fixed route segment.

## 2. Expose and render the document

- [x] 2.1 Add `sourceDocument: { url, filename } | null` to `loadLessonForStudent` in `src/server/student/lesson-data.ts`, checking `storageKey` plus `getStorage().exists` inside a try/catch; verify in `tests/student.integration.test.ts` that it is populated when the file exists and null when the object is missing.
- [x] 2.2 Create `src/components/student/pdf-viewer.tsx` with an accessible titled iframe, a ranged availability probe (`Range: bytes=0-0`), a 401 message that links back to `/[locale]/s/[token]`, a retry action, a full-screen toggle with new-tab fallback, an always-available open-in-new-tab action, and browser-download help text; verify with a component test that covers success, 401, generic failure with retry, and full-screen fallback.
- [x] 2.3 Add Greek and English strings for the PDF tab, viewer title, full-screen/exit, open-in-new-tab, unavailable message, retry, and download help in `messages/el.json` and `messages/en.json`; verify `tests/messages.test.ts` passes with identical key sets.

## 3. Wire the PDF tab into the lesson

- [x] 3.1 Add `"pdf"` to the `Tab` union and tab order in `src/components/student/lesson-tabs.tsx`, render the PDF tab first with an appropriate icon, select it by default when `sourceDocument` is present, keep `?tab=` deep links winning, and render the viewer for the PDF tab; verify with a component or e2e assertion that the PDF tab is first and initially selected while an explicit `?tab=cards` link still opens Cards.
- [x] 3.2 Hide the PDF tab when `sourceDocument` is null and fall back to the first available content tab; verify with a lesson fixture that has no stored PDF and confirm no PDF tab is rendered and Cards opens.

## 4. Framing, end-to-end checks, and full validation

- [x] 4.1 Change the global framing headers in `next.config.ts` to `X-Frame-Options: SAMEORIGIN` and CSP `frame-ancestors 'self'` while leaving every other header and directive unchanged; verify `npm run build` succeeds and the emitted header configuration still rejects external framing.
- [x] 4.2 Extend `e2e/student.spec.ts` to assert the PDF tab is first and selected on lesson open, the embedded viewer points at the source route, full-screen/open actions are available, switching to Cards is recorded in the URL, and locale switching keeps the PDF tab; run `npm run test:e2e -- e2e/student.spec.ts`.
- [x] 4.3 Run `npm run typecheck`, `npm run lint`, and `npm test`, then fix any regressions caused by the new tab default or header change.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived specs include the new `pdf-presentation` capability and the updated `student-experience` tab requirements.
