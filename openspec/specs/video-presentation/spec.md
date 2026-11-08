# video-presentation Specification

## Purpose

Produce a narrated video for each lesson directly from its PDF pages, and let students play the available language variant with captions.

## Requirements

### Requirement: Automatic video rendering

The system SHALL render each PDF page as a slide, synthesize narration for that page, and compose the slides and audio into a single MP4 with H.264 video and AAC audio.

#### Scenario: Successful render

- **WHEN** a lesson with a valid narration script finishes processing
- **THEN** the system produces a playable MP4 whose slides follow the PDF page order and whose narration matches each slide

#### Scenario: Narration pacing

- **WHEN** a slide's narration audio is shorter or longer than a fixed display time
- **THEN** the slide remains visible for the full duration of its narration plus the configured pause

### Requirement: Language variants

The system SHALL generate the video in the lesson's primary locale and SHALL allow the teacher to request an additional variant in the other supported locale.

#### Scenario: Primary locale rendered

- **WHEN** generation completes for a Greek lesson
- **THEN** a Greek-narrated video is rendered using the Greek narration script

#### Scenario: Additional locale requested

- **WHEN** the teacher requests an English variant for a Greek lesson
- **THEN** the system queues a separate render and exposes both variants when available

### Requirement: Video availability and failure isolation

The system SHALL expose video status independently and SHALL keep cards, questionnaire, and game available when video rendering fails.

#### Scenario: Video still rendering

- **WHEN** a lesson's text artifacts are ready but its video is still rendering
- **THEN** students can use the other tabs and the video tab shows a rendering state

#### Scenario: Video render failure

- **WHEN** video rendering fails
- **THEN** the lesson remains usable, the video tab shows an unavailable state, and the teacher can retry rendering

### Requirement: Video playback

The system SHALL stream rendered videos with seek support, show a poster frame before playback, and provide captions derived from the narration script.

#### Scenario: Seeking

- **WHEN** a student seeks within a video
- **THEN** playback resumes from the requested position using range requests

#### Scenario: Captions

- **WHEN** captions are enabled during playback
- **THEN** the narration text for the current slide is displayed synchronized with the audio

### Requirement: Video limits

The system SHALL enforce configured limits on page count, rendered duration, and output size, and SHALL report when a lesson cannot be rendered within those limits.

#### Scenario: Lesson exceeds limits

- **WHEN** a PDF exceeds the configured page or duration limit
- **THEN** video rendering is skipped or stopped with a clear reason while the lesson's other artifacts remain available

### Requirement: Private media handling

The system SHALL store rendered media privately and SHALL serve it only to clients presenting a valid share token for the lesson.

#### Scenario: Media without token

- **WHEN** a client requests a video URL without a valid share token
- **THEN** the system denies access and returns no media

#### Scenario: Lesson deletion cleans media

- **WHEN** a lesson or its class is deleted
- **THEN** its rendered videos, audio, and frames are removed from storage
