# Tasks

## 1. Failure taxonomy and copy

- [x] 1.1 Add a game failure mapper in `src/components/student/millionaire-game.tsx` (or a small helper beside it) that turns a response status plus parsed error code into `session`, `not_ready`, `no_questions`, `ended`, or `unexpected`, treating unparsable bodies and thrown fetches as `unexpected`; verify with unit tests covering 401, 403, 409 `not_ready`, 409 `no_game`, 409 `game_ended`, 500, and a non-JSON body.
- [x] 1.2 Add Greek and English `student.game*` strings for session expired, re-enter name, lesson not ready, no game questions, unexpected failure, and retry in `messages/el.json` and `messages/en.json`; verify `npm test -- tests/messages.test.ts` passes with identical key sets.

## 2. Game request feedback

- [x] 2.1 Replace the shared `error` state in `MillionaireGame` with the typed failure and render one state per kind on the start screen: a re-entry link to `/[locale]/s/[token]` for `session`, a retry plus refresh for `not_ready`, an explanatory no-game state for `no_questions`, and a retryable generic error for `unexpected`; verify with component tests that assert each rendered state and that `student.unavailable` is never used for these failures.
- [x] 2.2 Apply the same mapper to answer and lifeline requests, keep the last server-confirmed question/score/lifeline state on failure, and route `game_ended` to the ended state; verify with component tests that a failed answer or lifeline does not advance the question, score, or lifeline.
- [x] 2.3 Render the session-expired state from the same recovery action during play and confirm no attempt is shown as started after a failed start request; verify with a component test that the start screen remains on the recovery state instead of showing a question.

## 3. Readiness revalidation

- [x] 3.1 Call `router.refresh()` once after `not_ready` or `no_questions` and disable the retry action while the refresh is pending, using the existing i18n navigation router; verify with a component test that mocks the router and asserts one refresh per readiness failure.
- [x] 3.2 Make `LessonTabs` fall back to the first available tab when the active tab disappears after a refresh; verify with `tests/lesson-tabs.test.tsx` by rendering a game tab, removing `game` questions through a rerender, and asserting the active content is no longer the game.
- [x] 3.3 Keep `student.unavailable` only for genuinely missing content such as a video with no asset; verify by searching the game component and confirming no request-failure path references it.

## 4. Server contract coverage

- [x] 4.1 Add integration coverage in `tests/student.integration.test.ts` asserting `startGame` rejects a non-READY lesson with `not_ready`, a READY lesson without GAME questions with `no_game`, and that the start route returns `401 unauthorized` without a matching student session; verify `npm run test:integration -- tests/student.integration.test.ts` passes.

## 5. End-to-end and full validation

- [x] 5.1 Extend `e2e/student.spec.ts` with a scenario that opens a lesson, clears the `student_session` cookie while leaving the page rendered, clicks the game start action, and asserts the session-expired state with a working re-entry link instead of the unavailable copy.
- [x] 5.2 Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, and `npm run build`, then run the student e2e suite; fix any regressions.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived `quiz-game` spec contains the updated start requirement and the two added requirements.
