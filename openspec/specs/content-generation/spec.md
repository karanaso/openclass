# content-generation Specification

## Purpose

Turns extracted lesson page text into validated, bilingual learning artifacts, including exactly one narration segment for every source page that is published for speech synthesis and video rendering.

## Requirements

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

### Requirement: Question option cardinality is exact

The system SHALL require exactly four options for every `MULTIPLE_CHOICE` question and exactly two for every `TRUE_FALSE` question, in both the Greek and English option arrays. Nonconforming provider output SHALL fail schema parsing and use the existing retry loop; the system SHALL NOT add, remove, or fabricate options to satisfy the count.

#### Scenario: Multiple choice with the wrong option count

- **WHEN** the provider returns a `MULTIPLE_CHOICE` question with fewer or more than four options in either locale
- **THEN** that provider response fails schema parsing and the generation attempt is retried without publishing the malformed question

#### Scenario: True/false with the wrong option count

- **WHEN** the provider returns a `TRUE_FALSE` question with fewer or more than two options in either locale
- **THEN** that provider response fails schema parsing and the generation attempt is retried without publishing the malformed question

#### Scenario: Conforming option counts

- **WHEN** every `MULTIPLE_CHOICE` question has four options and every `TRUE_FALSE` question has two in both locales
- **THEN** the questions proceed to artifact validation

#### Scenario: Missing options are not invented

- **WHEN** the provider returns fewer options than the question type requires
- **THEN** the system does not synthesize a replacement option and instead retries the provider response

### Requirement: Question requests state exact option counts

The question generation request SHALL state that `MULTIPLE_CHOICE` questions have exactly four options with ids `"a"`, `"b"`, `"c"`, and `"d"`, and that `TRUE_FALSE` questions have exactly two options with ids `"a"` and `"b"`. This SHALL apply to both questionnaire and game requests.

#### Scenario: Game request states option counts

- **WHEN** a game question request is built
- **THEN** the prompt requires exactly four options for `MULTIPLE_CHOICE` and exactly two for `TRUE_FALSE`, with the corresponding option ids

### Requirement: Published questions match their required option count

Published questions SHALL contain exactly four options for `MULTIPLE_CHOICE` and exactly two for `TRUE_FALSE` in every locale, with option ids aligned across locales.

#### Scenario: Valid questions are published

- **WHEN** every multiple-choice question has four options and every true/false question has two, with aligned ids across locales
- **THEN** the lesson's questionnaire and game questions are published

#### Scenario: Validation still rejects an unresolved mismatch

- **WHEN** a question that reaches artifact validation has the wrong number of options
- **THEN** generation fails validation instead of publishing the malformed question
