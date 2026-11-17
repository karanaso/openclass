# Design

## Context

See `proposal.md` for motivation and `specs/quiz-game/spec.md` for the required behavior.

Current state that shapes the approach:

- `MillionaireGame` is a single client component that holds one `error: string | null` and maps every failed start, answer, and lifeline request (non-OK response, unparsable body, or thrown fetch) to `student.unavailable`.
- The game API already returns distinct statuses and codes: `401 unauthorized` from `requireStudentContext`, `409 not_ready` and `409 no_game` from `startGame`, `409 game_ended` from answer/lifeline, and `500 internal_error` for unexpected failures (`withPublic` → `toErrorResponse`).
- The lesson page server-renders `StudentLessonData`; the tab list derives `available.game` from `data.game.length`. The page only exists when `lesson.status === "READY"`, so a stale open tab can disagree with the server after a session or lesson-status change.
- `PdfViewer` already has the recovery pattern for an invalidated student session: a dedicated state with a link to `/[locale]/s/[token]` (`pdfSessionExpired`, `pdfReenterName`).
- Student sessions are stateless signed JWTs; the recent school claim intentionally invalidates older sessions, and API calls do not renew the session.

## Goals / Non-Goals

**Goals:**

- Make each game API outcome visible and actionable in the game UI.
- Recover from a stale session without a manual reload.
- Recover from stale lesson readiness by revalidating server data.
- Keep the client from showing progress the server did not confirm.

**Non-Goals:**

- Changing game rules, scoring, question ordering, lifeline math, or the server response payload.
- Changing session TTL or making the API silently accept incomplete sessions.
- Redesigning the lesson tab bar, the quiz, or the PDF viewer.
- Automatic polling while a lesson is being prepared.

## Decisions

### 1. Typed game failure state instead of one error string

Replace `error: string | null` with a discriminated failure value, for example:

```
type GameFailure =
  | { kind: "session" }
  | { kind: "not_ready" }
  | { kind: "no_questions" }
  | { kind: "ended" }
  | { kind: "unexpected" };
```

A single parser maps an HTTP response to a failure: status `401`/`403` → `session`; `409` with code `not_ready` → `not_ready`; `409` with `no_game` → `no_questions`; `409` with `game_ended` → `ended`; anything else, including a body that is not JSON, → `unexpected`.

Rationale: one mapping point is easy to test and prevents the component from re-deriving meaning in three request handlers. Alternative considered: showing the server's raw message; rejected because it is English-only and not written for students.

### 2. Reuse the PDF viewer's session-expired pattern

Render a session state with an explanation and a single link/button to `/[locale]/s/[token]`, titled like the existing re-entry action. Do not call the session `DELETE` endpoint automatically: the landing page already detects the mismatch and shows the form, and a failed background request must not mutate cookies silently.

Rationale: consistent student-facing recovery across tabs; alternative (auto-clearing cookies and redirecting) risks a redirect loop when the failure is not actually a session problem.

### 3. Revalidate readiness failures through the server component

On `not_ready` and `no_questions`, call `router.refresh()` after rendering the specific message. The refreshed RSC recomputes `sourceDocument`, `cards`, `game`, and `questionnaire` from the database. `LessonTabs` additionally falls back to the first available tab whenever the active tab is no longer available, so a hidden game tab cannot leave an empty content area.

Rationale: keeps server data authoritative without a new endpoint; alternative (client-side readiness endpoint + polling) adds API surface for a rare state.

### 4. Keep the current server behavior, only confirm the contract

No response-shape change: `startGame` continues to reject non-READY lessons and empty GAME question sets, and answer/lifeline keep using `game_ended`. The client must not pre-empt these checks; it only explains their results. Error bodies are parsed defensively because a proxy or dev-server HTML error page may not be JSON.

### 5. Localized strings per failure kind

Add `student.game*` keys in both message files: session expired, re-enter name, not ready, no questions, unexpected failure/retry, and a retry action label. Keep `student.unavailable` for genuinely missing content (for example a missing video), not for game request failures.

### 6. Test at three layers

- Component tests drive `MillionaireGame` with mocked `fetch` responses per status/code and assert the rendered state and actions.
- Integration tests assert the server still returns `not_ready`, `no_game`, and `unauthorized` for the corresponding fixtures.
- One e2e scenario loads a lesson, invalidates the student session cookie, and starts the game; the student must see the re-entry action, not the unavailable copy.

## Risks / Trade-offs

- **`router.refresh()` can race with a user retry** → refresh only after a readiness failure and keep the retry action disabled while the refresh is pending.
- **A 401 during play loses the local answer feedback but not server state** → the game can be resumed through the start action after re-entry; state is already server-held and keyed by the student name.
- **Error classification could drift from the server codes** → keep the codes in one shared client mapping and cover every code with tests.
- **A session-expired click could loop if the share link is also invalid** → the re-entry target is the landing page, which already renders the link error instead of looping.
- **Refreshing the tab list may close the game while the student is mid-game** → readiness failures occur before a game starts; an already-started game reports `game_ended`/`ended`, not a readiness failure.

## Migration Plan

No database or payload migration. Deploy the client and server together (the error codes already exist). Rollback is a revert of the component, copy, and tests; no data is affected.
