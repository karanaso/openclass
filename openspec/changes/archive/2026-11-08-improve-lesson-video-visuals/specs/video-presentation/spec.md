# Spec Delta

## ADDED Requirements

### Requirement: Scene and slide motion
The system SHALL add subtle motion to a character-enhanced video: a slow scene pan or zoom that varies across slides, an entrance animation when a new slide appears, and a designed slide card with a soft shadow and vignette. Motion SHALL remain gentle enough that slide text stays readable.

#### Scenario: Scene moves during a slide
- **WHEN** a character-enhanced slide plays
- **THEN** the background scene drifts or zooms slowly instead of remaining a frozen image

#### Scenario: Slide enters
- **WHEN** a new slide begins
- **THEN** the slide card fades or drifts into place over a short entrance animation

#### Scenario: Text stays readable
- **WHEN** scene motion and slide entrance are applied
- **THEN** the slide remains fully visible, unclipped, and readable for the slide's duration

### Requirement: Character motion polish
The system SHALL animate the character with gentle vertical bob, breathing, and sway in addition to its pose loop, so the character never looks like a static pasted image.

#### Scenario: Continuous motion
- **WHEN** a character-enhanced video plays
- **THEN** the character's position and scale change smoothly and continuously across the slide

#### Scenario: Motion survives long slides
- **WHEN** a slide lasts longer than one animation loop
- **THEN** bob, breathing, and sway remain continuous without a visible reset

## MODIFIED Requirements

### Requirement: Automatic video rendering
The system SHALL render each PDF page as a slide, synthesize narration for that page, and compose the slides and audio into a single MP4 with H.264 video and AAC audio. When a lesson visual set is ready, the system SHALL compose a side-panel layout with a designed slide card on the left and the lesson scene and animated character alongside it; otherwise it SHALL compose the existing full-slide layout.

#### Scenario: Successful render
- **WHEN** a lesson with a valid narration script finishes processing
- **THEN** the system produces a playable MP4 whose slides follow the PDF page order and whose narration matches each slide

#### Scenario: Narration pacing
- **WHEN** a slide's narration audio is shorter or longer than a fixed display time
- **THEN** the slide remains visible for the full duration of its narration plus the configured pause

#### Scenario: Slides stay readable
- **WHEN** a video is composed with the scene and character panel
- **THEN** the full slide is visible without cropping and remains large enough to read its text

#### Scenario: Standard layout without artwork
- **WHEN** no ready visual set exists for the lesson
- **THEN** the video renders in the existing full-slide layout and remains playable

### Requirement: Character presence throughout the video
The system SHALL show the animated character on every slide of a character-enhanced video, playing a continuous talking and idle animation for the slide's full duration. The poster image SHALL show the same composed layout.

#### Scenario: Character on every slide
- **WHEN** a character-enhanced video plays
- **THEN** the character is visible on every slide from the first frame to the last

#### Scenario: Poster matches the video
- **WHEN** a student sees the video poster before playback
- **THEN** the poster shows the slide, scene, and character in the same layout as the first video frame

#### Scenario: Long slide
- **WHEN** a slide lasts longer than one animation loop
- **THEN** the character animation repeats smoothly for the entire slide
