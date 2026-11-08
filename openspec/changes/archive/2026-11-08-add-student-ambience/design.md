# Design

## Context

See `proposal.md` for motivation and `specs/student-ambience/spec.md` for the behavior contract.

Relevant current state:

- `src/components/student/millionaire-game.tsx` already owns a mute toggle backed by `window.localStorage["lessonlab:muted"]` (`"1"` means muted) and synthesizes short effects with WebAudio; it has no ambient music.
- `src/components/student/questionnaire.tsx` has no sound at all and no mute control.
- `LessonTabs` conditionally renders only the active tab, so leaving a mode unmounts its component.
- `prefers-reduced-motion` is already honored for game transitions through `useReducedMotion`.
- The content security policy allows `media-src 'self' blob:`, and `public/` currently has no media assets.
- `howler` and `@types/howler` are already installed but unused.
- Students are unauthenticated and reach lessons through share links; ambience must be entirely client-side.
- The student experience is mobile-first, and the existing end-to-end test toggles mute in the game before moving to the quiz.

## Goals / Non-Goals

**Goals:**

- One small client API that owns sound preference, ambient playback, and effect gating for both modes.
- Playback that satisfies browser autoplay rules and never surprises a student before they interact.
- A balloon that is purely decorative, cheap to animate, and safe for reduced-motion and assistive-technology users.
- A bundled, license-clean audio asset with no third-party requests or build-time network dependency.

**Non-Goals:**

- Server-side audio, streaming, per-lesson playlists, or volume sliders.
- Audio or animation on the cards or video tabs.
- Changing quiz-game scoring, question delivery, timers, or the existing sound-effect vocabulary.
- Changing the `lessonlab:muted` storage key or its existing meaning.
- Syncing the preference to the server or across devices.

## Decisions

### 1. A shared `useStudentSound` hook owns preference and ambience

Add `src/components/student/use-student-sound.ts` with a hook that returns `{ muted, toggleMute, startAmbience, stopAmbience, pauseAmbience, resumeAmbience, playTone }`.

- The stored preference is read in an effect to avoid hydration mismatches; ambience never starts until the preference has been read.
- `muted` defaults to `false` when the key is absent (confirmed product decision), and `toggleMute` writes `"1"`/`"0"` to `lessonlab:muted`. A `storage` listener keeps two open tabs consistent.
- `playTone` moves the game's existing oscillator logic behind the same mute gate so effects and music can never disagree.
- The hook exposes a small `ambience` status (`idle | playing | paused | blocked`) so components can test and reflect state without duplicating logic.

Alternative considered: keep per-component mute state. Rejected because the quiz needs the same preference and the two states would drift.

### 2. Howler for the loop, WebAudio for effects

Create the ambient loop with `Howler` (`loop: true`, `volume: 0`, `html5: false`) and fade to `0.16` on start. Howler is already a dependency, handles mobile unlock, pause/resume, and loop gaps better than a bare `<audio>` element, and avoids adding a package.

The existing synthesized effects stay on WebAudio because they are generated per event; they now go through `playTone` from the hook. Effect gain remains about `0.06`, so ambience sits under feedback sounds.

- On unmount, `stopAmbience` unloads/pauses the Howl and clears fades.
- `visibilitychange` pauses and resumes; a `pauseAmbience` that happened because the mode ended must not be overridden by the visibility handler, so the hook tracks whether the mode is still active.

Alternative considered: a single `<audio loop>` element. Rejected for weaker fade control and less reliable seek/loop behavior across mobile browsers.

### 3. Gesture-gated playback per mode

The hook does not attach global listeners. Each mode decides when interaction has occurred:

- **Game:** `start()` is triggered by the start button, so a successful start calls `startAmbience()` directly. This is already a user gesture.
- **Quiz:** attach one-time `pointerdown` and `keydown` listeners to the questionnaire container (and call from option selection/navigation handlers) so the first genuine interaction starts ambience. Opening the tab alone never plays audio.
- If muted, interaction marks the mode ready but does not play; unmuting while the mode is active starts ambience immediately.
- Game end (`ENDED`/`COMPLETED`) and questionnaire result (`showResult`) call `stopAmbience()`. Leaving the tab unmounts the component, whose cleanup also stops playback.

### 4. Balloon as an isolated client component with randomized timeouts

Add `src/components/student/balloon-celebration.tsx`, rendered only in an active game or questionnaire.

- A timeout chain schedules the first balloon after a randomized 15–30 seconds, keeps it visible for about 6 seconds, then schedules the next after another randomized 20–45 seconds.
- Each balloon randomizes horizontal start, drift direction, size, and one of a few cheerful colors; animation uses a CSS `transform`/`opacity` keyframe on a GPU-friendly layer.
- The layer is `fixed inset-0 pointer-events-none overflow-hidden` with `aria-hidden="true"`; the balloon is an inline SVG (no image request).
- When `prefers-reduced-motion` is set, the component renders nothing. The spec requires suppression; omitting the decoration entirely is the clearest interpretation.
- The component is keyed by mode and unmounts when the session ends, which cancels pending timeouts and satisfies the no-balloon-after-end requirement.

Alternative considered: trigger balloons on correct answers. Rejected because the request asks for occasional decoration, and tying it to correctness would compete with the existing feedback animation and could imply a reward signal.

### 5. Asset: an original synthesized loop checked into `public/`

Add `scripts/generate-ambience.sh` (ffmpeg) that produces `public/audio/student-ambience.mp3`: a 30–40 second, mono, 96 kbps loop built from soft major-key sine/triangle plucks over a gentle pad, normalized low. Commit the generated file so production builds and offline installs need no generation step.

- This avoids licensing ambiguity and keeps every byte same-origin.
- The script documents the exact command so the asset can be regenerated; a short note in `docs/media.md` records provenance and intended volume.
- Target size is under 500 KB. MP3 is supported by every target browser; no fallback format is needed.
- CSP already permits `media-src 'self'`.

Alternative considered: a CC0 track from a sample library. Rejected because provenance and license review add overhead for a decorative loop.

### 6. Quiz gains the same mute affordance

`Questionnaire` renders the existing `Volume2`/`VolumeX` ghost button in its progress row using the existing `student.mute` / `student.unmute` translations, with `data-testid="quiz-mute"`. The game's toggle is kept and gains `data-testid="game-mute"`. No new message keys are required.

### 7. Testing strategy

- **Unit (`vitest`, jsdom):** mock `howler`, use fake timers to verify mute persistence, storage-event sync, gesture gating, visibility pause/resume, stop-on-end, and balloon interval/reduced-motion behavior.
- **End-to-end (`playwright`):** after starting the game, assert a request for `/audio/student-ambience.mp3` occurs after interaction and not before; mute in the game, open the quiz, and assert the quiz shows the muted state; use `page.clock` to fast-forward past the first balloon interval and assert the balloon appears, then click an option while it is visible to prove it does not intercept input.
- Keep the existing student end-to-end flow green; it mutes in the game before the quiz, so the quiz must honor that preference.

## Risks / Trade-offs

- **Autoplay blocked despite gating** → use Howler's unlock + only start from a real gesture; a blocked state stays silent and never surfaces an error.
- **Default-on music annoys students** → low volume, persistent one-click mute in both modes, pause when the tab is hidden, and no music until the student interacts.
- **Balloon distracts or blocks clicks** → one balloon at a time, `pointer-events-none`, short lifetime, no focus change, and fully omitted for reduced motion.
- **jsdom cannot play audio** → mock Howler at the module boundary and assert lifecycle calls rather than real playback.
- **Two audio systems disagree on mute** → all playback goes through the same hook state; direct WebAudio calls in the game are removed.
- **Long-lived timers leak** → every timeout is cleared on unmount, on mode end, and when reduced motion is enabled.
- **Static asset bloat** → a single sub-500 KB mono loop; no video or multiple bitrates.

## Migration Plan

1. Ship the asset and shared hook without changing visible behavior, then wire the game and questionnaire.
2. Deploy the static asset and components together; no database migration or server change is involved.
3. Rollback is removing the component usage and asset; the stored mute key remains backward compatible.

## Open Questions

None.
