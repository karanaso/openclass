# content-generation Specification

## Purpose

Turns extracted lesson page text into validated, bilingual learning artifacts, including exactly one narration segment for every source page that is published for speech synthesis and video rendering.

## Requirements

### Requirement: Narration is normalized to one segment per supplied page

Before validation, the system SHALL reduce provider narration output to exactly one segment for each page supplied in the generation request. When several segments cite the same page, the system SHALL keep the segment with the greatest combined length of its Greek and English script text, breaking ties by the segment's first occurrence in provider order.

#### Scenario: Duplicate segments for the same page

- **WHEN** the provider returns two or more narration segments with the same page number
- **THEN** the system keeps one segment for that page and continues generation instead of reporting a duplicate narration validation failure

#### Scenario: Identical duplicate segments

- **WHEN** the provider returns multiple identical narration segments for the same page
- **THEN** the system keeps one copy of that segment

#### Scenario: Segments citing pages outside the request

- **WHEN** the provider returns a narration segment for a page number that was not supplied in the generation request
- **THEN** the system discards that segment before validation

### Requirement: Normalized narration preserves page order and coverage

The system SHALL order normalized narration by ascending page number and SHALL retain one segment for every page supplied in the request.

#### Scenario: Provider returns segments out of order

- **WHEN** the provider returns narration segments whose page numbers are not ascending
- **THEN** the published narration is ordered by ascending page number

#### Scenario: A supplied page has no segment

- **WHEN** normalization produces no narration segment for a page that was supplied in the request
- **THEN** validation fails with a message identifying the missing page

### Requirement: Narration requests state the exact required pages

The narration generation request SHALL list the exact page numbers being requested and SHALL require exactly one segment for each listed page with no repeated page numbers.

#### Scenario: Prompt lists requested pages

- **WHEN** a narration request is built for a set of pages
- **THEN** the prompt names every supplied page number and instructs the provider to return exactly one segment per page

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

### Requirement: Publishing guarantees one narration segment per source page

Published narration SHALL contain exactly one segment per source page that has extracted text. A generation attempt that still contains duplicate or missing narration after normalization SHALL fail validation and remain eligible for the configured retry behavior.

#### Scenario: Duplicate remains after normalization

- **WHEN** the normalized narration still contains more than one segment for a page
- **THEN** generation fails validation rather than publishing ambiguous narration

#### Scenario: Valid narration is published

- **WHEN** every source page with extracted text has exactly one normalized narration segment
- **THEN** the lesson's narration is published with one segment per page for both locales

### Requirement: Published questions match their required option count

Published questions SHALL contain exactly four options for `MULTIPLE_CHOICE` and exactly two for `TRUE_FALSE` in every locale, with option ids aligned across locales.

#### Scenario: Valid questions are published

- **WHEN** every multiple-choice question has four options and every true/false question has two, with aligned ids across locales
- **THEN** the lesson's questionnaire and game questions are published

#### Scenario: Validation still rejects an unresolved mismatch

- **WHEN** a question that reaches artifact validation has the wrong number of options
- **THEN** generation fails validation instead of publishing the malformed question

### Requirement: Narration normalization is observable

The system SHALL emit a structured log entry when normalization drops duplicate or out-of-scope narration segments, including how many segments were dropped and which page numbers were affected.

#### Scenario: Duplicates are dropped

- **WHEN** normalization removes one or more narration segments
- **THEN** a structured warning records the count of dropped segments and the affected page numbers
