# lesson-generation Specification

## Purpose

Turn an extracted lesson PDF into validated, source-grounded bilingual study cards, assessment questions, game questions, and narration scripts using AI, with failure and regeneration handled safely.

## Requirements

### Requirement: PDF content extraction

The system SHALL extract text and page boundaries from each accepted PDF and SHALL retain the page number with every extracted passage.

#### Scenario: Text PDF extracted

- **WHEN** a PDF containing selectable text is processed
- **THEN** the system stores its extracted text with page numbers for later generation

#### Scenario: Image-only PDF

- **WHEN** a PDF yields no usable text
- **THEN** the lesson fails with a clear message explaining that scanned or image-only PDFs are not supported

### Requirement: Generated artifact set

The system SHALL generate a study card deck, a questionnaire, a game question set, and a per-page narration script for every lesson, using configurable item counts.

#### Scenario: All artifacts produced

- **WHEN** generation completes successfully
- **THEN** the lesson has a deck within the configured card range, a questionnaire within the configured item range, a game set within the configured game range, and narration for each rendered page

#### Scenario: Question format mix

- **WHEN** the questionnaire is generated
- **THEN** it contains both true/false and four-option single-answer multiple-choice items, each with exactly one correct answer and an explanation

### Requirement: Source grounding

The system SHALL derive every card, question, explanation, and narration segment from the lesson text and SHALL attach a valid source page to each generated item.

#### Scenario: Valid source reference

- **WHEN** an item is published
- **THEN** its source page exists in the lesson and its content is supported by the extracted text for that lesson

#### Scenario: Invalid item discarded

- **WHEN** a generated item lacks a valid source page, has no correct answer, or duplicates an existing item
- **THEN** the system discards or regenerates that item before publishing the artifact

### Requirement: Bilingual output

The system SHALL produce Greek and English variants for every deck card, questionnaire item, game question, and narration script, keeping item identity, answer keys, and correct-option positions aligned across locales.

#### Scenario: Aligned locales

- **WHEN** a questionnaire item is generated in Greek and English
- **THEN** both variants share the same item identifier, source page, correct answer, and explanation meaning

#### Scenario: Greek source material

- **WHEN** the source PDF is written in Greek
- **THEN** Greek content is treated as the primary variant and English is produced as a translation without changing the assessed facts

### Requirement: Validation before publication

The system SHALL validate generated artifacts against the required schema, item counts, answer-key rules, and locale completeness before exposing them to students.

#### Scenario: Invalid output withheld

- **WHEN** the model returns malformed or incomplete structured output
- **THEN** the artifact is not published and the job is retried or fails according to the retry policy

#### Scenario: No partial lesson

- **WHEN** any required text artifact is still invalid after the configured retries
- **THEN** the lesson is marked failed and students cannot start it

### Requirement: Retry and idempotent regeneration

The system SHALL retry transient generation failures with backoff and SHALL replace a lesson's artifacts only after a complete new generation succeeds.

#### Scenario: Transient failure retried

- **WHEN** an AI request fails with a retryable error
- **THEN** the system retries up to the configured limit before marking the job failed

#### Scenario: Regeneration keeps previous version until ready

- **WHEN** the teacher regenerates a ready lesson
- **THEN** the existing artifacts remain available until the replacement generation is validated and committed

### Requirement: Generation usage records

The system SHALL record model, token usage, and estimated cost for each generation job and SHALL expose totals per lesson and per class to the teacher.

#### Scenario: Usage recorded

- **WHEN** a generation job completes or fails
- **THEN** its model, token counts, and estimated cost are stored and included in the class usage summary

### Requirement: Student data excluded from AI requests

The system SHALL send only lesson content and generation instructions to the AI provider and SHALL NOT include student names, attempts, or results in generation requests.

#### Scenario: No student data in prompts

- **WHEN** any generation request is constructed
- **THEN** it contains lesson text and instructions only, with no student identifiers or assessment records
