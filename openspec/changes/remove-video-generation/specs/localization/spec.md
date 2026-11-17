# Spec Delta

## MODIFIED Requirements

### Requirement: Localized generated content

The system SHALL present cards, questionnaire items, and game questions in the selected locale when that variant exists.

#### Scenario: Student selects English content

- **WHEN** a student views a lesson in English
- **THEN** cards, questions, and explanations are shown from the English variants

#### Scenario: Missing content variant

- **WHEN** a requested locale variant is unavailable for a lesson mode
- **THEN** the system shows the lesson's primary locale and indicates the fallback
