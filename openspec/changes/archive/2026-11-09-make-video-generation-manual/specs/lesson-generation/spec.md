# Spec Delta

## MODIFIED Requirements

### Requirement: Generated artifact set

The system SHALL generate a study card deck, a questionnaire, and a game question set for every lesson, using configurable item counts. Narration scripts SHALL be prepared separately when a teacher requests a video variant.

#### Scenario: All artifacts produced

- **WHEN** generation completes successfully
- **THEN** the lesson has a deck within the configured card range, a questionnaire within the configured item range, and a game set within the configured game range, without requiring narration to be present

#### Scenario: Question format mix

- **WHEN** the questionnaire is generated
- **THEN** it contains both true/false and four-option single-answer multiple-choice items, each with exactly one correct answer and an explanation

### Requirement: Source grounding

The system SHALL derive every card, question, and explanation from the lesson text and SHALL attach a valid source page to each generated item. Narration preparation SHALL use the same lesson text and page boundaries when it runs.

#### Scenario: Valid source reference

- **WHEN** an item is published
- **THEN** its source page exists in the lesson and its content is supported by the extracted text for that lesson

#### Scenario: Invalid item discarded

- **WHEN** a generated item lacks a valid source page, has no correct answer, or duplicates an existing item
- **THEN** the system discards or regenerates that item before publishing the artifact

### Requirement: Bilingual output

The system SHALL produce Greek and English variants for every deck card, questionnaire item, and game question, keeping item identity, answer keys, and correct-option positions aligned across locales. Narration SHALL be prepared in both locales when the first video variant is requested.

#### Scenario: Aligned locales

- **WHEN** a questionnaire item is generated in Greek and English
- **THEN** both variants share the same item identifier, source page, correct answer, and explanation meaning

#### Scenario: Greek source material

- **WHEN** the source PDF is written in Greek
- **THEN** Greek content is treated as the primary variant and English is produced as a translation without changing the assessed facts
