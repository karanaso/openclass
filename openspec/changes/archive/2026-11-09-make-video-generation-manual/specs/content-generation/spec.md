# Spec Delta

## ADDED Requirements

### Requirement: Content generation publishes without narration

The system SHALL validate and publish only cards, questionnaire items, and game questions during content generation. Missing, invalid, or absent narration SHALL NOT fail content generation or prevent the lesson from becoming `READY`.

#### Scenario: Sparse page does not block content

- **WHEN** a source page contains little prose and the narration stage would omit it
- **THEN** content generation still publishes the cards, questionnaire, and game and marks the lesson `READY`

#### Scenario: No narration provider call

- **WHEN** content generation runs
- **THEN** it does not request narration from the content provider and does not include narration in its artifact validation

#### Scenario: Content-only retry

- **WHEN** content validation fails
- **THEN** the retry covers only cards, questionnaire, and game, not narration

### Requirement: Content publication clears stale narration

When new content is published, the system SHALL remove previously published narration scripts for that lesson so stale scripts cannot be reused with changed page text.

#### Scenario: Regeneration clears scripts

- **WHEN** new content is published for a lesson
- **THEN** the lesson's previous narration segments are deleted

#### Scenario: Next video prepares fresh scripts

- **WHEN** a video is requested after content regeneration
- **THEN** narration is prepared from the lesson's current pages rather than the removed scripts

## REMOVED Requirements

### Requirement: Narration is normalized to one segment per supplied page

**Reason**: Narration is prepared by the manual `NARRATION` stage when a teacher requests video, not during content generation.

**Migration**: Narration normalization now runs in the `NARRATION` stage and is specified under `video-presentation`.

### Requirement: Normalized narration preserves page order and coverage

**Reason**: Narration coverage is no longer a content-generation validation rule.

**Migration**: Page order and coverage are enforced by the `NARRATION` stage and specified under `video-presentation`.

### Requirement: Narration requests state the exact required pages

**Reason**: The narration prompt is no longer built during content generation.

**Migration**: The narration request and its exact page list are produced by the `NARRATION` stage and specified under `video-presentation`.

### Requirement: Publishing guarantees one narration segment per source page

**Reason**: Publication now covers only cards, questionnaire, and game; narration is published separately when video is requested.

**Migration**: Narration publication and missing-page handling are specified under `video-presentation`.

### Requirement: Narration normalization is observable

**Reason**: Narration normalization no longer runs inside content generation.

**Migration**: Normalization logging moves to the `NARRATION` stage and is specified under `video-presentation`.
