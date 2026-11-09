# Spec Delta

## ADDED Requirements

### Requirement: Teacher video variant preview

The system SHALL let an authenticated teacher preview any `READY` video variant from the lesson admin page without creating or using a student share link, and SHALL stream previews with seek support, poster, and captions.

#### Scenario: Preview a ready variant

- **WHEN** the teacher chooses Play next to a `READY` video variant
- **THEN** the admin page shows that locale's video with its poster and captions and allows seeking within it

#### Scenario: Preview unavailable before rendering succeeds

- **WHEN** a variant is missing, pending, rendering, failed, or skipped
- **THEN** the system does not offer a working Play action for that variant and requests no media for it

#### Scenario: Preview requires teacher authentication

- **WHEN** a client without a valid teacher session requests an admin video preview URL
- **THEN** the system denies the request and returns no media

#### Scenario: Rendered media missing from storage

- **WHEN** a variant is marked `READY` but its stored video cannot be read
- **THEN** the preview reports that the video is unavailable instead of breaking the lesson admin page

### Requirement: Teacher re-render a video variant

The system SHALL let an authenticated teacher request a fresh render of a lesson's video variant for a supported locale, including when that variant is already `READY`, and SHALL limit the refresh to narration and video while preserving cards, questions, and the lesson visual set.

#### Scenario: Recreate a ready variant

- **WHEN** the teacher chooses Recreate next to a `READY` video variant
- **THEN** the system queues a new render for that locale, shows the variant as processing, and leaves the other locale unchanged

#### Scenario: Recreate after a previous render completed

- **WHEN** the teacher requests Recreate for a variant whose earlier render job is still retained by the queue
- **THEN** the system still starts a new render instead of treating the request as a duplicate of the completed job

#### Scenario: Artwork is reused

- **WHEN** a character-enhanced variant is recreated
- **THEN** the new render reuses the lesson's existing visual set and generates no new artwork

#### Scenario: Recreate while already processing

- **WHEN** a variant is pending or rendering
- **THEN** the system prevents another recreate request for that variant from starting duplicate work

#### Scenario: Recreate failure isolation

- **WHEN** a recreated variant fails
- **THEN** that variant reports its failure reason while the lesson's cards, questionnaire, game, and other locale remain available

#### Scenario: Unauthenticated recreate denied

- **WHEN** a client without a valid teacher session requests a re-render
- **THEN** the system denies the request and queues no work
