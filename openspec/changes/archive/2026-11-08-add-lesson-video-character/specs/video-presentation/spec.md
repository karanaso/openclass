# Spec Delta

## MODIFIED Requirements

### Requirement: Automatic video rendering

The system SHALL render each PDF page as a slide, synthesize narration for that page, and compose the slides and audio into a single MP4 with H.264 video and AAC audio. When a lesson visual set is ready, the system SHALL compose a side-panel layout with the slide on the left and the lesson scene and animated character alongside it; otherwise it SHALL compose the existing full-slide layout.

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

## ADDED Requirements

### Requirement: Character presence throughout the video

The system SHALL show the animated character on every slide of a character-enhanced video, playing a continuous idle loop for the slide's full duration. The poster image SHALL show the same composed layout.

#### Scenario: Character on every slide

- **WHEN** a character-enhanced video plays
- **THEN** the character is visible on every slide from the first frame to the last

#### Scenario: Poster matches the video

- **WHEN** a student sees the video poster before playback
- **THEN** the poster shows the slide, scene, and character in the same layout as the first video frame

#### Scenario: Long slide

- **WHEN** a slide lasts longer than one idle animation loop
- **THEN** the character animation repeats smoothly for the entire slide

### Requirement: Visual set reuse across language variants

The system SHALL generate at most one visual set per lesson and SHALL use the same scene and character in every language variant of that lesson's video.

#### Scenario: Second locale reuses artwork

- **WHEN** the teacher requests the other language variant after a character-enhanced video exists
- **THEN** the new variant uses the stored visual set without generating new artwork

#### Scenario: One visual set per lesson

- **WHEN** a lesson has videos in both locales
- **THEN** both videos show the same scene and character design

### Requirement: Visual enhancement failure isolation

The system SHALL keep the video available in the standard layout when character or scene artwork is missing, invalid, or failed, and SHALL NOT fail the lesson because of the enhancement.

#### Scenario: Artwork generation failed

- **WHEN** visual generation failed for a lesson
- **THEN** the video still renders and plays in the full-slide layout

#### Scenario: Artwork unavailable during render

- **WHEN** a video render starts but the visual set is not ready
- **THEN** the render proceeds without the character instead of waiting indefinitely

#### Scenario: Failure reason retained

- **WHEN** a character-enhanced video falls back because of a visual failure
- **THEN** the recorded visual status retains the reason the character is absent
