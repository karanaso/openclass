# Spec Delta

## ADDED Requirements

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
