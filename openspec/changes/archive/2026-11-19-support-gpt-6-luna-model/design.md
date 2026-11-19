# Design

## Context

See `proposal.md` for motivation.

- `OpenAIContentProvider.call` posts to `https://api.openai.com/v1/responses` with `model`, `input`, `temperature: 0.2`, `max_output_tokens: 16000`, and a strict JSON Schema in `text.format`.
- The model comes from `OPENAI_TEXT_MODEL` and is otherwise unconstrained by `src/lib/env.ts`.
- `estimateCost` maps model ids to per-1M-token rates and falls back to `{ input: 1, output: 4 }` for unknown models.
- GPT-6 Luna accepts the Responses API and structured outputs but rejects `temperature` whenever reasoning effort is not `none`. Its default effort is `medium`, so omitting the `reasoning` field still rejects `temperature`.
- `zod-to-json-schema` emits `{"not": {}}` for `.optional().nullable()` fields. OpenAI's strict validator rejects that node as `invalid_json_schema`; the rubric and resource-suggestion schemas contain it.

## Goals / Non-Goals

**Goals:**

- Make every provider request acceptable to GPT-6 Luna and to the existing `gpt-4.1-*` models.
- Make every generated artifact schema valid for strict structured output.
- Let operators choose reasoning effort without exposing unsupported sampling parameters.
- Record realistic costs for the new model.
- Preserve prompts, structured-output schemas, response parsing, retries, and publication behavior.

**Non-Goals:**

- Detecting model capabilities at runtime or from the model name.
- Supporting non-OpenAI gateways or the Chat Completions endpoint.
- Adding per-request or per-artifact sampling controls.
- Changing prompts, token limits, retry policy, or generated content contracts.

## Decisions

### 1. Remove `temperature` from the request unconditionally

Delete the `temperature` field from the Responses request body.

- It is the only parameter the provider currently sends that GPT-6 reasoning models reject at a non-`none` effort.
- The request then works across reasoning and non-reasoning models without name-based branching.
- OpenAI recommends sampling at the default 1.0, and the strict JSON Schema plus the prompts carry the output-shape requirement.

Alternatives considered:

- **Keep `temperature` for known non-reasoning models.** Requires a model allowlist that goes stale with every new model and adds a failure mode when an alias changes.
- **Set `reasoning.effort: "none"` to keep `temperature: 0.2`.** Restricts future model choices (some GPT-6 models reject `none`) and gives up reasoning quality on models where it is the point.
- **Retry once without `temperature` after a 400.** Wastes a request per call, pollutes logs with expected failures, and complicates the retry/attempt accounting.

### 2. Add optional `OPENAI_REASONING_EFFORT`

Parse `OPENAI_REASONING_EFFORT` as an optional enum of `none`, `low`, `medium`, `high`, `xhigh`, and `max`. When present, send `reasoning: { effort }`; when absent, omit `reasoning` entirely. `temperature` stays absent in both cases.

- Keeps zero behavior change for existing deployments that do not set it.
- Gives operators a supported way to trade latency/cost against quality on reasoning models.
- Fails fast at startup on a typo instead of receiving a provider 400 per job.
- The enum is the union published for GPT-6 Luna; a model that supports fewer values still returns an actionable provider error.

Alternatives considered:

- **Default to `none`.** Invalid for non-reasoning models and for GPT-6 models that require reasoning (Astra, 6.1 Sol).
- **Free-form string.** Defers a configuration typo to every generation request.
- **No setting.** Works, but leaves reasoning cost/latency entirely at the model default with no operator control.

### 3. Keep the endpoint, request shape, and response parsing

The Responses API, strict `text.format` JSON Schema, `max_output_tokens`, and `extractOutputText` remain as they are. GPT-6 Luna supports both structured outputs and the Responses API, so the compatibility fix is limited to removing the rejected sampling field and optionally adding `reasoning`.

### 4. Add GPT-6 Luna to the price table

Add `"gpt-6-luna": { input: 0.1, output: 0.5 }` to `MODEL_PRICING`. Reasoning tokens are included in `output_tokens`, which is already what the estimator multiplies by the output rate. Lesson text is chunked at roughly 48k characters, so requests stay below the 272K-token long-context tier that would double input rates.

The `gpt-4.1-mini` code default stays unchanged; operators opt in by setting `OPENAI_TEXT_MODEL`, as the reported deployment already does. `.env.example` and the docs show GPT-6 Luna explicitly.

### 5. Normalize strict JSON Schemas before sending

Extend `strictify` to drop an empty `not` object and to remove empty object entries from an `anyOf` array, flattening a single remaining branch when it is the node's only key. This converts Zod's optional-nullable output from `{"anyOf":[{"anyOf":[{"not":{}},{"type":"string"}]},{"type":"null"}]}` to `{"anyOf":[{"type":"string"},{"type":"null"}]}`.

- OpenAI's strict validator requires a `type` on every schema node; the raw Zod conversion violates that for `.optional().nullable()` fields.
- The fix belongs in the one place that converts all artifact schemas, so rubric and resource-suggestion requests are covered without editing each schema and changing response parsing.
- It preserves the response contract: `optional().nullable()` still accepts missing, null, or string values when parsing the returned JSON.

Alternatives considered:

- **Change rubric/suggestion fields to `.nullable()` only.** Produces a clean schema but makes previously optional response fields mandatory for parsing, which can reject otherwise valid provider output.
- **Hand-maintain JSON Schemas for those artifacts.** Duplicates the Zod definitions and drifts from the parsing contract.
- **Retry rubric without structured output.** Loses the schema guarantee and adds a second response format to maintain.

## Risks / Trade-offs

- **Reasoning tokens count toward `max_output_tokens: 16000`** → Verify one real card/question generation after the change. If responses end `incomplete`, either raise the cap or set a lower `OPENAI_REASONING_EFFORT`; both are configuration/code constants in the same path.
- **Removing `temperature` changes sampling for older models** → Structured schemas and retries still constrain output; compare one generated lesson with the previous model before rollout. The change is easily reverted as a single field.
- **Model-specific effort support differs** → The setting is optional and documented as model-dependent; unsupported values surface as a provider 400 on the first request.
- **Published pricing can change** → The price table is already a small local constant; update it independently of request behavior.
- **Schema normalization could flatten a meaningful single-branch `anyOf`** → Only flatten when `anyOf` is the node's sole key and the branch is a typed schema; unit tests cover all artifact schemas and the nullable fixture.
- **GPT-6 Luna output quality may differ from `gpt-4.1-mini`** → Validate one lesson end-to-end (topics, cards, questionnaire, game, rubric) before switching production traffic.

## Migration Plan

1. Deploy the provider and env changes; existing deployments keep working because the new setting is optional.
2. Set `OPENAI_TEXT_MODEL=gpt-6-luna` (already done in the reporting environment) and optionally `OPENAI_REASONING_EFFORT`.
3. Regenerate one lesson and confirm topics, cards, questions, and the rubric publish and that usage records the model and a plausible cost.
4. Rollback: unset/change `OPENAI_TEXT_MODEL` or revert the request change; no data migration is involved.
