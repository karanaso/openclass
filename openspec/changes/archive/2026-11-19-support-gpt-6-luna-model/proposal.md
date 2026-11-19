# Proposal

## Why

Setting `OPENAI_TEXT_MODEL=gpt-6-luna` makes every generation request fail with HTTP 400: `Unsupported parameter: 'temperature' is not supported with this model.` GPT-6 Luna is a reasoning model, and it rejects sampling parameters such as `temperature` whenever reasoning effort is not `none`; the provider always sends `temperature: 0.2`. Topic generation is logged and skipped, but card and question generation exhaust their retries, so no lesson can become ready.

## What Changes

- **Stop sending unsupported sampling parameters.** Remove `temperature` from the OpenAI Responses request so reasoning models such as GPT-6 Luna accept it. Structured outputs, the Responses endpoint, and the existing prompts stay unchanged.
- **Expose reasoning effort as an optional setting.** Add `OPENAI_REASONING_EFFORT` (`none`, `low`, `medium`, `high`, `xhigh`, `max`). When set, it is sent as `reasoning.effort`; when unset, the field is omitted and the model's own default applies. No sampling parameter is sent in either case.
- **Price the new model.** Add `gpt-6-luna` to the per-model price table so recorded generation costs reflect its actual rates instead of the generic fallback.
- **Document the configuration.** Update `.env.example` and the generation/operations docs with the GPT-6 Luna example, the new optional variable, and the reasoning-model constraint.
- **Cover the request shape with tests.** Assert that requests omit `temperature`, that `reasoning.effort` appears only when configured, and that the environment parser rejects unknown effort values.
- **Normalize generated JSON Schemas.** Remove empty `not` nodes and flatten single-branch `anyOf` output produced for nullable fields, so OpenAI strict structured outputs accept the rubric and resource-suggestion schemas.

### Assumptions

- The configured account exposes `gpt-6-luna`; the failure is the request parameter, not model access.
- GPT-6 Luna supports the Responses API with strict JSON Schema structured outputs, so the endpoint and response parsing need no change.
- The published short-context pricing is $0.10 per 1M input tokens and $0.50 per 1M output tokens; lesson chunks stay well below the 272K-token long-context tier.
- Omitting `temperature` changes sampling for non-reasoning models from 0.2 to the provider default; the prompts and strict schemas carry the determinism requirement, so no separate sampling control is introduced.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `lesson-generation`: generation requests must be compatible with the configured model (no sampling parameters unsupported by reasoning models), reasoning effort must be selectable without changing other request behavior, and recorded cost estimates must cover the configured model.

## Impact

- **Code**: `src/lib/env.ts` (`OPENAI_REASONING_EFFORT`), `src/server/generation/openai-provider.ts` (request body and strict-schema normalization), `src/server/generation/usage.ts` (GPT-6 Luna pricing).
- **Configuration/docs**: `.env.example`, `docs/generation.md`, `docs/operations.md`.
- **Tests**: `tests/openai-provider.test.ts`, `tests/env.test.ts`, `tests/strictify.test.ts`, plus a usage/cost assertion.
- **Dependencies / APIs / data**: no dependency, database, route, storage, or response-schema changes. Existing `gpt-4.1-*` configurations remain valid.
