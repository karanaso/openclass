# lesson-generation Specification

## Purpose

Turn an extracted lesson PDF into validated, source-grounded bilingual study cards, assessment questions, and game questions using AI, with failure and regeneration handled safely.

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

The system SHALL generate a study card deck, a questionnaire, and a game question set for every lesson, using configurable item counts.

#### Scenario: All artifacts produced

- **WHEN** generation completes successfully
- **THEN** the lesson has a deck within the configured card range, a questionnaire within the configured item range, and a game set within the configured game range

#### Scenario: Question format mix

- **WHEN** the questionnaire is generated
- **THEN** it contains both true/false and four-option single-answer multiple-choice items, each with exactly one correct answer and an explanation

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

### Requirement: Provider requests are compatible with the configured model

The system SHALL send only request parameters that the configured OpenAI model supports. It SHALL NOT send sampling parameters, including `temperature`, that reasoning models reject when reasoning effort is not `none`. Structured output, the Responses endpoint, prompts, and response validation SHALL remain unchanged.

#### Scenario: Reasoning model configured

- **WHEN** `OPENAI_TEXT_MODEL` names a reasoning model such as `gpt-6-luna`
- **THEN** generation requests omit `temperature` and complete without an unsupported-parameter rejection

#### Scenario: Non-reasoning model configured

- **WHEN** `OPENAI_TEXT_MODEL` names a model that accepts sampling parameters
- **THEN** generation requests still omit `temperature`, use the provider default sampling, and validate the structured response as before

#### Scenario: Unsupported parameter is never reintroduced

- **WHEN** any lesson, topic, rubric, or resource-suggestion request is built
- **THEN** its body contains no `temperature` field

### Requirement: Provider JSON Schemas are valid for strict structured output

The system SHALL send only strict JSON Schemas that OpenAI's structured-output validator accepts. It SHALL remove empty `not` subschemas and SHALL ensure every `anyOf` branch carries a type. This SHALL apply to card, question, topic, rubric, and resource-suggestion requests.

#### Scenario: Nullable rubric field

- **WHEN** a rubric request is built for a model using strict structured output
- **THEN** its schema contains no empty `not` node and the request is accepted instead of failing with `invalid_json_schema`

#### Scenario: Every artifact schema normalized

- **WHEN** any artifact request schema is generated
- **THEN** it contains no empty object subschema and every `anyOf` branch has a type

### Requirement: Reasoning effort is configurable

The system SHALL accept an optional `OPENAI_REASONING_EFFORT` setting with one of `none`, `low`, `medium`, `high`, `xhigh`, or `max`, and SHALL send it as `reasoning.effort` on provider requests. When the setting is absent, the system SHALL omit `reasoning` and use the model's default effort.

#### Scenario: Reasoning effort configured

- **WHEN** `OPENAI_REASONING_EFFORT` is set to a supported value
- **THEN** each provider request includes `reasoning.effort` with that value and still omits `temperature`

#### Scenario: Reasoning effort omitted

- **WHEN** `OPENAI_REASONING_EFFORT` is not set
- **THEN** provider requests omit the `reasoning` field and rely on the model default

#### Scenario: Invalid reasoning effort

- **WHEN** `OPENAI_REASONING_EFFORT` is set to an unsupported value
- **THEN** environment parsing fails with an error naming `OPENAI_REASONING_EFFORT`

### Requirement: Cost estimates cover the configured model

The system SHALL estimate generation cost from the configured model's published token rates when the model is known, and SHALL continue recording the model, token counts, and estimated cost for each generation job. Models without a known rate SHALL keep the existing fallback rate.

#### Scenario: GPT-6 Luna usage priced

- **WHEN** a generation job records usage for `gpt-6-luna`
- **THEN** its estimated cost uses the published $0.10 per 1M input tokens and $0.50 per 1M output tokens

#### Scenario: Unknown model fallback

- **WHEN** a generation job records usage for a model missing from the price table
- **THEN** the existing fallback rate is used and the job still records its model and token counts
