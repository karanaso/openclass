# student-ambience Specification

## Purpose

Add a light, shared layer of encouragement to the game and questionnaire: cheerful ambient music, an occasional celebratory balloon, and one persistent sound preference that governs both.

## Requirements

### Requirement: Ambient music during game and questionnaire

The system SHALL play a low-volume looping ambient track while the student is actively playing the game or taking the questionnaire, starting only after an explicit student interaction and stopping when the mode ends.

#### Scenario: Start after an interaction

- **WHEN** the student starts the game or performs the first answer or navigation action in the questionnaire while sound is enabled
- **THEN** the ambient loop begins and continues across questions without restarting for each item

#### Scenario: No playback before interaction

- **WHEN** the game or questionnaire mode becomes visible without any student interaction
- **THEN** no ambient audio plays until the student interacts

#### Scenario: Default sound preference

- **WHEN** the student has never set a sound preference
- **THEN** sound is treated as enabled and ambient audio follows the interaction rule above

#### Scenario: Hidden tab

- **WHEN** the browser tab becomes hidden during an active game or questionnaire
- **THEN** ambient music pauses, and it resumes when the tab is visible again if the mode is still active and sound is enabled

#### Scenario: Stop when the mode ends

- **WHEN** the student leaves the mode, the game reaches an ended or completed state, or the questionnaire result is shown
- **THEN** ambient music stops

### Requirement: Occasional balloon celebration

The system SHALL display a decorative animated balloon at randomized intervals during active game and questionnaire sessions, without blocking interaction or conveying required information.

#### Scenario: Balloon appears periodically

- **WHEN** the student remains in an active game or questionnaire session
- **THEN** a balloon animation enters the view roughly every 20 to 45 seconds, drifts across the screen, and leaves within a few seconds

#### Scenario: Balloon does not block controls

- **WHEN** the balloon is visible
- **THEN** question options, navigation, and sound controls remain operable and the keyboard focus does not change

#### Scenario: Decoration hidden from assistive technology

- **WHEN** the balloon animation is present
- **THEN** it is not announced to screen readers and cannot receive focus

#### Scenario: Reduced motion

- **WHEN** the student's device requests reduced motion
- **THEN** the drifting balloon animation is suppressed while all game and questionnaire information remains available

#### Scenario: No balloon after the session ends

- **WHEN** the game has ended or the questionnaire result is shown
- **THEN** no further balloons appear

### Requirement: Shared persistent sound control

The system SHALL provide a keyboard-operable sound toggle in both the game and the questionnaire that controls all student-mode audio and persists the student's preference across modes and visits.

#### Scenario: Mute everything

- **WHEN** the student activates mute
- **THEN** ambient music and game sound effects stop immediately and the muted preference is stored

#### Scenario: Preference shared across modes

- **WHEN** the student who muted sound in the game opens the questionnaire
- **THEN** the questionnaire starts silent and its sound control shows the muted state

#### Scenario: Unmute

- **WHEN** the student activates sound again
- **THEN** ambient audio resumes in the current mode after the interaction and future visits start with sound enabled

#### Scenario: Accessible control

- **WHEN** the sound control is reached by keyboard or screen reader
- **THEN** it is focusable, operable, and labelled with the action it will perform

### Requirement: Local media and failure tolerance

The system SHALL serve ambient audio from the application's own origin without third-party media requests, and audio failures SHALL NOT block or alter the game or questionnaire.

#### Scenario: Same-origin asset

- **WHEN** the student enables or starts ambient audio
- **THEN** the audio is fetched from the application's own origin with no request to an external media service

#### Scenario: Audio unavailable

- **WHEN** the audio asset cannot be fetched or the browser refuses playback
- **THEN** the game and questionnaire remain fully usable, no blocking error is shown, and scores, answers, and timing are unaffected
