# lesson-character-art Specification

## Purpose

Produces a lesson-specific illustrated scene and a transparent-background animated character for use in the lesson video, with validated assets, per-lesson reuse, and failure isolation.

## Requirements

### Requirement: Art-direction brief

The system SHALL derive a bounded art-direction brief from the lesson title and extracted page text before generating artwork, using the configured text model, and SHALL fall back to a deterministic brief when that text call fails. The brief SHALL contain no student data.

#### Scenario: Brief guides artwork

- **WHEN** visual generation starts for a lesson with extracted text
- **THEN** the system produces a brief describing the subject, setting, mood, palette, character role, and props, and uses it in both the scene and character prompts

#### Scenario: Brief generation fails

- **WHEN** the configured text model is unavailable or returns an invalid brief
- **THEN** the system records the fallback and continues with a deterministic brief built from the lesson title and excerpt

#### Scenario: Brief excludes student data

- **WHEN** a brief is generated or stored
- **THEN** it contains lesson title and page text only, with no student names, attempts, or results

### Requirement: Artwork quality controls

The system SHALL let operators configure the image model and quality used for lesson artwork, SHALL default to an image model available on the configured provider and to high quality, and SHALL record the model, quality, and prompt version used for each visual set. When the provider reports that the configured model does not exist, the system SHALL treat it as a visual-generation failure whose reason names the configured model.

#### Scenario: High quality by default

- **WHEN** no image quality override is configured
- **THEN** scene and character artwork are requested at high quality

#### Scenario: Default model is available

- **WHEN** `OPENAI_IMAGE_MODEL` is not set
- **THEN** scene and character artwork are requested with a model that the configured account exposes, without requiring an operator override

#### Scenario: Cost-saving model selected

- **WHEN** an operator configures a lower-cost image model
- **THEN** the system uses that model and records it without changing the rest of the pipeline

#### Scenario: Prompt upgrade invalidates artwork

- **WHEN** the current prompt version differs from the version stored on a lesson's visual set
- **THEN** the next render treats the artwork as stale and regenerates it instead of reusing it

#### Scenario: Configured model does not exist

- **WHEN** the image provider rejects the configured model as unknown
- **THEN** the visual set fails with a reason that names the configured model and `OPENAI_IMAGE_MODEL`, and the lesson and video remain usable

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

The system SHALL validate the sprite sheet against the expected 3×2 grid, require six non-empty transparent cells with consistent scale and baseline, and split it into individual pose frames before animation. A sheet that fails any check SHALL be rejected rather than sliced arbitrarily.

#### Scenario: Valid sprite sheet

- **WHEN** the provider returns an image matching the expected six-cell grid with non-empty transparent cells
- **THEN** the system slices it into the configured pose frames and proceeds to character animation

#### Scenario: Malformed sprite sheet

- **WHEN** the sprite sheet dimensions do not match the expected grid
- **THEN** the system marks the visual set failed and does not produce a partial animation

#### Scenario: Empty or misaligned cell

- **WHEN** a cell contains no visible character or its scale or baseline differs from the other cells beyond the configured tolerance
- **THEN** the system marks the visual set failed and the video uses the standard layout

### Requirement: Idle animation loop

The system SHALL produce a looping character animation with blink, a talking mouth cycle, wave, and lean poses, using a transparent background so the character can be composed over the lesson scene. Composition SHALL add gentle bob, breathing, and sway so the character never appears frozen.

#### Scenario: Loop is produced

- **WHEN** valid pose frames exist
- **THEN** the system stores a seamless animation loop suitable for repeated overlay during video rendering

#### Scenario: Loop runs for the whole video

- **WHEN** a slide's narration is longer than one animation loop
- **THEN** the character loop repeats for the full slide duration without ending early

#### Scenario: Character appears to speak

- **WHEN** a character-enhanced slide plays narration
- **THEN** the character alternates the talk-closed and talk-open poses while blinking and occasionally waving

### Requirement: Visual set lifecycle

The system SHALL generate a lesson's visual set at most once while it is current, SHALL reuse it across video renders and locales, and SHALL replace it when the lesson is regenerated, when the prompt version changes, or when a teacher explicitly regenerates artwork.

#### Scenario: Existing visual set reused

- **WHEN** a video is rendered for a lesson whose visual set is ready for the current prompt version
- **THEN** the system reuses the stored scene and character assets without another generation request

#### Scenario: Regeneration replaces artwork

- **WHEN** a lesson is regenerated or the teacher regenerates artwork
- **THEN** the previous visual set is no longer used, and a new set is generated from the current lesson content and prompt version

#### Scenario: Artwork refresh updates variants

- **WHEN** artwork regeneration completes for a lesson that already has rendered videos
- **THEN** the system re-renders those variants with the new visual set while keeping the same narration audio

### Requirement: Artwork preview and regeneration

The system SHALL expose the current scene and character sheet to an authenticated teacher and SHALL allow the teacher to regenerate artwork without regenerating cards, questions, narration, or other lesson content.

#### Scenario: Teacher previews artwork

- **WHEN** an authenticated teacher opens the lesson detail page for a lesson with a ready visual set
- **THEN** the page shows the scene and character sheet through an authorized media route

#### Scenario: Teacher regenerates artwork

- **WHEN** the teacher requests artwork regeneration
- **THEN** the system regenerates only the visual set and refreshes existing video variants to use it

#### Scenario: Content is preserved

- **WHEN** artwork regeneration completes
- **THEN** cards, questions, narration, and attempts are unchanged

#### Scenario: Preview requires authorization

- **WHEN** a client requests an artwork preview without an authenticated teacher session
- **THEN** the system denies access and returns no artwork

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
