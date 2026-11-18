# Spec Delta

## MODIFIED Requirements

### Requirement: Question edits do not change other artifacts

The system SHALL limit a question change to the question set and SHALL NOT change the lesson's cards, share links, or existing question positions.

#### Scenario: Other artifacts remain unchanged

- **WHEN** the teacher saves or creates a question
- **THEN** the lesson's cards, share links, and the order of other questions remain unchanged
