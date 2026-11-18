# content-generation Specification

## Purpose

Turns extracted lesson page text into validated, bilingual questionnaire and game questions with exact option counts, safe retries, and predictable publication.

## Requirements

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
