# lesson-character-art Specification

## Purpose

Produces a lesson-specific illustrated scene and a transparent-background animated character for use in the lesson video, with validated assets, per-lesson reuse, and failure isolation.

## Requirements

### Requirement: Per-lesson visual set

The system SHALL generate one visual set per lesson containing a background scene relevant to the lesson topic and a transparent-background character sprite sheet with idle poses. Prompts SHALL be derived only from the lesson title and extracted page text.

#### Scenario: Visual set generated

- **WHEN** a lesson's text content is available and visual generation runs
- **THEN** the system stores a lesson-relevant background scene and a character sprite sheet for that lesson

#### Scenario: Locale-independent artwork

- **WHEN** a lesson has Greek and English content and both video variants are rendered
- **THEN** both variants use the same visual set without generating new artwork for the second locale

### Requirement: Safe, content-appropriate artwork

Character and scene prompts SHALL request school-appropriate, non-photorealistic artwork with no readable text, no logos or brands, no real-person likenesses, and no student data. Provider output that fails these constraints or moderation SHALL be treated as a visual failure.

#### Scenario: Artwork excludes student data

- **WHEN** a visual generation request is built
- **THEN** it contains lesson title and page text only, with no student names, attempts, or results

#### Scenario: Unsafe output rejected

- **WHEN** the image provider rejects the prompt or returns output that cannot be accepted as school-appropriate artwork
- **THEN** the visual set is marked failed and the video falls back to the standard composition

### Requirement: Sprite sheet validation and slicing

The system SHALL validate the sprite sheet against the expected grid dimensions and split it into individual pose frames before animation. A sprite sheet that does not match the expected grid SHALL be rejected rather than sliced arbitrarily.

#### Scenario: Valid sprite sheet

- **WHEN** the provider returns an image matching the expected sprite grid
- **THEN** the system slices it into the configured pose frames and proceeds to character animation

#### Scenario: Malformed sprite sheet

- **WHEN** the sprite sheet dimensions do not match the expected grid
- **THEN** the system marks the visual set failed and does not produce a partial animation

### Requirement: Idle animation loop

The system SHALL produce a looping character animation that combines a gentle vertical bob with periodic blink and wave poses, using a transparent background so the character can be composed over the lesson scene.

#### Scenario: Loop is produced

- **WHEN** valid pose frames exist
- **THEN** the system stores a seamless idle animation loop suitable for repeated overlay during video rendering

#### Scenario: Loop runs for the whole video

- **WHEN** a slide's narration is longer than one animation loop
- **THEN** the character loop repeats for the full slide duration without ending early

### Requirement: Visual set lifecycle

The system SHALL generate a lesson's visual set at most once while it is current, SHALL reuse it across video renders and locales, and SHALL replace it only when the lesson is regenerated or a teacher explicitly retries.

#### Scenario: Existing visual set reused

- **WHEN** a video is rendered for a lesson whose visual set is already ready
- **THEN** the system reuses the stored scene and character assets without another generation request

#### Scenario: Regeneration replaces artwork

- **WHEN** a lesson is regenerated
- **THEN** the previous visual set is no longer used, and a new set is generated from the new lesson content

### Requirement: Visual failure isolation

The system SHALL record visual generation status, model, and failure reason independently of video status, and SHALL NOT fail the lesson or block video rendering when visual generation fails.

#### Scenario: Visual generation fails

- **WHEN** scene or character generation fails after its configured attempts
- **THEN** the visual set is marked failed with a reason, the lesson remains usable, and the video renders without the character

#### Scenario: Status is observable

- **WHEN** the teacher inspects video or lesson status after a visual failure
- **THEN** the recorded visual status explains why the character is absent

### Requirement: Private artwork storage

The system SHALL store scene, sprite, and animation assets outside any public directory and SHALL remove them when the lesson or its class is deleted.

#### Scenario: Direct access denied

- **WHEN** a client requests a stored character or scene asset without an authorized lesson route
- **THEN** the system returns no artwork

#### Scenario: Deletion cleans artwork

- **WHEN** a lesson or its class is deleted
- **THEN** its stored visual assets are removed
