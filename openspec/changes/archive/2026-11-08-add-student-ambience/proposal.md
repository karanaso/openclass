# Proposal

## Why

The game already uses short sound effects and motion, but the questionnaire is silent and visually static, so a long assessment feels flat compared with the game. Students need a light, shared layer of encouragement in both modes — a cheerful looping background track and an occasional celebratory balloon — without changing scoring, timing, or how the assessment is delivered.

## What Changes

- Add a low-volume, looped ambient music track that plays while the student is actively playing the game or taking the questionnaire, starting only after an explicit student interaction so browser autoplay rules are respected.
- Default the ambience to audible for students who have never chosen a sound preference, and let the existing persistent mute control silence it everywhere.
- Pause ambience while the browser tab is hidden and stop it when the student leaves the mode, finishes the game, or sees the questionnaire result.
- Add a decorative balloon that drifts across the screen at randomized intervals (roughly every 20–45 seconds) during active game and quiz sessions, remaining non-interactive, hidden from assistive technology, and suppressed when the device requests reduced motion.
- Extend the sound toggle to the questionnaire and share one persisted preference (`lessonlab:muted`) between the game and the quiz.
- Ship the ambience audio as a local, same-origin asset so playback does not depend on a third-party service.
- Leave game logic, question payloads, scoring, timers, and API contracts unchanged.

## Capabilities

### New Capabilities

- `student-ambience`: Ambient music and occasional celebratory animation shared by the game and questionnaire, including gesture-gated playback, lifecycle handling, and the persistent sound preference.

### Modified Capabilities

<!-- None: quiz-game sound effects, questionnaire assessment rules, and student-experience tab behavior are unchanged. -->

## Impact

- `public/audio/`: new bundled ambience loop served from the app origin.
- `src/components/student/`: shared ambience/sound hook and balloon overlay, integrated into `millionaire-game.tsx` and `questionnaire.tsx`.
- `scripts/`: optional deterministic asset-generation script if the loop is synthesized rather than sourced.
- `messages/el.json`, `messages/en.json`: sound-toggle labels and any balloon-related accessible text.
- `docs/`: note the audio asset provenance and the sound preference behavior.
- Tests: component-level scheduling/mute tests and an end-to-end check that the preference is shared across game and quiz and that the balloon can appear without blocking controls.
- No database, Prisma, server API, or job-queue changes. `howler` and `@types/howler` are already dependencies and may be used for playback.
