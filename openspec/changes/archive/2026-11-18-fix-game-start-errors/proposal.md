# Proposal

## Why

A student on the Game tab can click "Έναρξη παιχνιδιού" and see only the generic message "Αυτό το περιεχόμενο δεν είναι διαθέσιμο ακόμη." even though the lesson is READY and the game has questions. The start API already distinguishes the real causes — an expired or incomplete student session (401), a lesson that is not ready (409 `not_ready`), no game question set (409 `no_game`), and unexpected server failures (500) — but `MillionaireGame` collapses every non-OK response and every network error into that one unavailable string and leaves the student on the start card. The student has no idea whether to re-enter their name, wait for the teacher, or retry, and the tab keeps offering a start action that keeps failing until a full page reload. This matters now because the recent school-claim change intentionally invalidates older student sessions, so a tab opened before that change can hit 401 on every game action while still rendering the lesson page.

## What Changes

- Replace the single "content not available" game error with a small set of explicit, localized game states:
  - **Session required/expired (401/403)**: explain that the name entry expired and offer one action that returns the student to the share link's name entry page, matching the existing PDF viewer's session-expired pattern.
  - **Lesson being prepared (409 `not_ready`)**: explain that the lesson is still being prepared, keep a retry action, and revalidate the lesson data so the game tab reflects the current readiness.
  - **No game set (409 `no_game`)**: explain that this lesson has no game questions yet and stop offering a start action.
  - **Unexpected failure (5xx, malformed response, network)**: show a generic retryable error that does not masquerade as missing content, and keep the start action available.
- Apply the same error taxonomy to the game answer and lifeline requests so an expired session or an ended session is reported accurately instead of as unavailable content.
- Revalidate lesson data after a readiness-related start failure, so a stale tab hides or disables the game tab once the server says there is no game or the lesson is no longer ready.
- Keep the server as the authority for readiness and allowed actions: the client only explains and routes; it never starts a game, reveals answers, or bypasses the session check.
- Add Greek and English copy for every new state; remove the misleading reuse of `student.unavailable` for game request failures.
- Do **not** change game rules, scoring, lifelines, question ordering, session TTL, or the response payload shape.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `quiz-game`: the game session start requirement now defines how the game reports and recovers from session, readiness, missing-question-set, and transient failures; the end-of-session/expiry requirement gains the corresponding re-entry behavior.

## Impact

- `src/components/student/millionaire-game.tsx`: replace the shared `error` string with typed failure states, map HTTP status and error codes, add the re-enter-name and retry actions, and refresh lesson data for readiness failures.
- `src/components/student/lesson-tabs.tsx`: pass a revalidation hook or gate the tab on refreshed `StudentLessonData` so `not_ready`/`no_game` results stop advertising a startable game.
- `src/server/student/game.ts` and `src/app/api/s/[token]/lessons/[lessonId]/game/*/route.ts`: confirm the existing error codes cover each case, and keep 401 distinct from 409 readiness errors; no response shape change.
- `messages/el.json` and `messages/en.json`: new game error/retry/re-entry strings with identical key sets.
- Tests: component tests for each failure mapping, an integration test asserting the server codes for not-ready, no-game, and unauthorized starts, and an e2e scenario where a page rendered with an invalidated session recovers through the name entry link instead of showing the unavailable copy.
