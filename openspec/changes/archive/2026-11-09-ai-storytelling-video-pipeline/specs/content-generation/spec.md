# Spec Delta

## MODIFIED Requirements

### Requirement: Content publication clears stale narration

When new content is published, the system SHALL invalidate the lesson's previously prepared story so stale scenes cannot be reused with changed page text. The system SHALL NOT need to delete legacy narration rows to satisfy this requirement.

#### Scenario: Regeneration clears scripts

- **WHEN** new content is published for a lesson with a current story
- **THEN** the lesson's story is marked stale or removed

#### Scenario: Next video prepares fresh scripts

- **WHEN** a video is requested after content regeneration
- **THEN** the story is prepared from the lesson's current pages rather than the invalidated story
