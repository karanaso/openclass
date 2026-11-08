# Tasks

## 1. Audio asset and shared sound foundation

- [x] 1.1 Add `scripts/generate-ambience.sh` using ffmpeg to synthesize a seamless 30–40 second, mono, 96 kbps cheerful loop and generate `public/audio/student-ambience.mp3`; verify with `ffprobe` that the duration and channel count match and that the file is under 500 KB, then commit the generated asset.
- [x] 1.2 Implement `src/components/student/use-student-sound.ts` with `muted` loaded from `lessonlab:muted`, default-unmuted behavior, `toggleMute` persistence, `storage`-event sync, Howler loop start/stop/pause/resume with fades, an `idle | playing | paused | blocked` status, and `playTone` gated by mute; verify `npm run typecheck` and `npm run lint` pass.
- [x] 1.3 Add `tests/student-sound.test.ts` with Howler mocked at the module boundary and fake timers, covering: default unmuted when the key is absent, toggle writes `"1"`/`"0"`, a `storage` event updates state, mute prevents both tones and ambience, visibility pause/resume, stop on mode end, and a Howler load failure leaving the status blocked without throwing; verify with `npm test -- tests/student-sound.test.ts`.
- [x] 1.4 Document the generated asset's provenance, intended volume, same-origin path, and the `lessonlab:muted` preference in `docs/media.md`; verify every documented path and key matches the implementation.

## 2. Balloon celebration component

- [x] 2.1 Add `src/components/student/balloon-celebration.tsx` and the CSS keyframes: a single inline-SVG balloon on a fixed `pointer-events-none` layer, randomized first delay of 15–30 seconds, about 6 seconds of drift, subsequent randomized 20–45 second intervals, and no rendering when `prefers-reduced-motion` is set; verify the component renders nothing under reduced motion and clears every timeout on unmount.
- [x] 2.2 Add `tests/balloon-celebration.test.tsx` with fake timers covering the first appearance window, automatic disappearance, scheduling of the next balloon, cleanup on unmount, and reduced-motion suppression; assert the layer is `aria-hidden`, has no focusable descendants, and uses pointer-events-none; verify with `npm test -- tests/balloon-celebration.test.tsx`.

## 3. Game integration

- [x] 3.1 Refactor `src/components/student/millionaire-game.tsx` to use `useStudentSound`: remove the local mute/audio-context state, start ambience from the start-button success path, stop it on `ENDED`/`COMPLETED` and unmount, keep effects through `playTone`, and add `data-testid="game-mute"` to the existing toggle; verify `npm run typecheck` and `npm run lint` pass.
- [x] 3.2 Render `BalloonCelebration` only while the game state is `ACTIVE` so it disappears with the end screen; verify by checking the component tree and confirming no balloon schedules after a terminal state.

## 4. Questionnaire integration and shared preference

- [x] 4.1 Add the sound toggle to `src/components/student/questionnaire.tsx` in the progress row using the existing `student.mute` / `student.unmute` messages and `data-testid="quiz-mute"`, start ambience on the first option click, navigation, or keypress inside the quiz, stop it when the result is shown or on unmount, and render `BalloonCelebration` only while answering; verify `npm run typecheck` and `npm test -- tests/messages.test.ts` pass without adding new message keys.
- [x] 4.2 Confirm the shared preference behavior: muted in the game, the quiz starts silent and shows the muted control; unmuting in the quiz starts ambience there and persists `"0"`; verify with a jsdom test or manual browser check and note the result in the pull request description.

## 5. End-to-end verification

- [x] 5.1 Extend `e2e/student.spec.ts` with ambience assertions: no request to `/audio/student-ambience.mp3` before the game starts, a request after the start interaction, the game mute value persisting into the quiz and its sound control reflecting it, and a `page.clock` fast-forward that reveals the balloon while an option click still works; verify with `npx playwright test e2e/student.spec.ts`.
- [x] 5.2 Run the broader quality gates `npm run lint`, `npm run typecheck`, and `npm test`; verify all pass.

## Workflow follow-up

- Archive the change after review and successful verification.
