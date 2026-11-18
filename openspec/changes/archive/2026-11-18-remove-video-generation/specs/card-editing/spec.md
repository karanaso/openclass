# Spec Delta

## MODIFIED Requirements

### Requirement: Card edits do not change other artifacts

The system SHALL limit a card update to the card's prompt and answer text and SHALL NOT change the lesson's questions, game content, or card order.

#### Scenario: Artifacts remain unchanged

- **WHEN** the teacher saves a card edit
- **THEN** the lesson's questionnaire, game, and card order remain unchanged
