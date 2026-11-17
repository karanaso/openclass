# Proposal

## Why

Students currently reach a lesson's cards, video, game, and quiz, but they cannot see the original lesson material the teacher uploaded. When a card or quiz explanation is not enough, the student has to leave the app or ask the teacher for the source PDF. Exposing the stored lesson PDF as a first-class tab lets students read the material in the same flow and makes the lesson self-contained.

## What Changes

- Add a PDF tab to the student lesson view, placed first in the tab order, before Cards.
- Open the lesson on the PDF tab by default when the source document is available, so students start from the material and can switch to Cards, Video, Game, or Quiz.
- Serve the lesson's original uploaded PDF through the student share-link session, without exposing storage paths or making the file public.
- Embed the PDF with the browser's native viewer, including a full-screen control (with an open-in-new-tab fallback where element full screen is unavailable) and a download/open action.
- Show an explanatory unavailable state when a READY lesson has no retrievable source PDF instead of a blank or broken tab.
- Keep the existing tab order and available-tab behavior for lessons whose source document is missing.

## Capabilities

### New Capabilities

- `pdf-presentation`: Viewing the lesson's original source PDF as student material, including tab availability, access control, embedded viewer, full-screen behavior, and mobile/fallback presentation.

### Modified Capabilities

- `student-experience`: The Lesson tabs requirement now includes a PDF tab, places it first, and opens it by default; direct tab links and locale persistence continue to apply.

## Impact

- `src/components/student/lesson-tabs.tsx`: add the PDF tab, icon, ordering, default selection, and unavailable state.
- New component under `src/components/student/` for the embedded viewer and full-screen control.
- `src/server/student/lesson-data.ts`: expose the source-document availability/URL in `StudentLessonData`.
- New student route under `src/app/api/s/[token]/lessons/[lessonId]/` to stream the stored PDF with session and share checks; reuse `serveStoredMedia`/storage.
- `next.config.ts`: the global `X-Frame-Options: DENY` and `frame-ancestors 'none'` currently block same-origin embedding; the PDF response (and CSP) must allow same-origin framing without weakening other routes.
- `messages/en.json` and `messages/el.json`: PDF tab, viewer, full-screen, and unavailable strings.
- Tests: integration coverage for the new route's authorization and response headers, plus e2e coverage for tab order, default tab, PDF visibility, and unavailable state.
