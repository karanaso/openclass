# Spec Delta

## MODIFIED Requirements

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
