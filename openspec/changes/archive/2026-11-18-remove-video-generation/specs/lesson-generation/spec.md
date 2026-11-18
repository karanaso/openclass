# Spec Delta

## ADDED Requirements

### Requirement: Generated item grounding

The system SHALL derive every card, question, and explanation from the lesson text and SHALL attach a valid source page to each generated item.

#### Scenario: Valid source reference

- **WHEN** an item is published
- **THEN** its source page exists in the lesson and its content is supported by the extracted text for that lesson

#### Scenario: Invalid item discarded

- **WHEN** a generated item lacks a valid source page, has no correct answer, or duplicates an existing item
- **THEN** the system discards or regenerates that item before publishing the artifact

### Requirement: Bilingual generated content

The system SHALL produce Greek and English variants for every deck card, questionnaire item, and game question, keeping item identity, answer keys, and correct-option positions aligned across locales.

#### Scenario: Aligned locales

- **WHEN** a questionnaire item is generated in Greek and English
- **THEN** both variants share the same item identifier, source page, correct answer, and explanation meaning

#### Scenario: Greek source material

- **WHEN** the source PDF is written in Greek
- **THEN** Greek content is treated as the primary variant and English is produced as a translation without changing the assessed facts

## MODIFIED Requirements

### Requirement: Generated artifact set

The system SHALL generate a study card deck, a questionnaire, and a game question set for every lesson, using configurable item counts.

#### Scenario: All artifacts produced

- **WHEN** generation completes successfully
- **THEN** the lesson has a deck within the configured card range, a questionnaire within the configured item range, and a game set within the configured game range

#### Scenario: Question format mix

- **WHEN** the questionnaire is generated
- **THEN** it contains both true/false and four-option single-answer multiple-choice items, each with exactly one correct answer and an explanation

## REMOVED Requirements

### Requirement: Source grounding
**Reason**: The requirement combined content grounding with story preparation, and story preparation is removed with lesson video.

**Migration**: The remaining grounding behavior for cards, questions, and explanations is specified by the added "Generated item grounding" requirement.

### Requirement: Bilingual output
**Reason**: The requirement combined bilingual card, question, and game output with story locale preparation, and stories are removed with lesson video.

**Migration**: The remaining bilingual behavior for cards, questions, and the game is specified by the added "Bilingual generated content" requirement.
