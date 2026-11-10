# Spec Delta

## MODIFIED Requirements

### Requirement: Localized generated content

The system SHALL present cards, questionnaire items, game questions, story narration, captions, and video variants in the selected locale when that variant exists.

#### Scenario: Student selects English content

- **WHEN** a student views a lesson in English
- **THEN** cards, questions, explanations, and any available English story narration or captions are shown from the English variants

#### Scenario: Missing content variant

- **WHEN** a requested locale variant is unavailable for a lesson mode
- **THEN** the system shows the lesson's primary locale and indicates the fallback
