# Proposal

## Why

The character-art path defaults `OPENAI_IMAGE_MODEL` to `gpt-image-1`, but the configured OpenAI account does not expose that model. A read-only `GET /v1/models` returns HTTP 200 without `gpt-image-1` (while `gpt-image-1-mini` is present), so creating a character fails with `400 ... The model 'gpt-image-1' does not exist.` The artwork feature therefore fails before any image is generated.

## What Changes

- **Pin a verified default image model.** Change the `OPENAI_IMAGE_MODEL` default from `gpt-image-1` to `gpt-image-1-mini`, which was confirmed present on the configured account and keeps the same OpenAI Images API request shape.
- **Keep the model operator-overridable.** `OPENAI_IMAGE_MODEL` remains the single switch: an operator may select a newer or higher-fidelity model that their account exposes.
- **Make the failure actionable.** When the provider rejects the configured model as unknown, the image path reports an `image_model_unavailable` visual failure naming the model and `OPENAI_IMAGE_MODEL`, instead of surfacing the raw provider 400. Existing failure isolation is preserved: the lesson remains usable and video rendering continues without the character.
- **Document the requirement.** `.env.example` and `docs/generation.md` state that the model must exist for the configured account and show how to verify it with `GET /v1/models`.
- **Update tests** for the new default and the mapped failure.

### Assumptions

- `gpt-image-1-mini` accepts the current request fields (`size`, `quality`, `output_format`, and transparent `background`), consistent with its existing documentation as the lower-cost image option.
- The account also exposes newer image models; this change pins the lowest-risk verified model and leaves the choice of a newer model to explicit operator configuration.
- No student data is sent to the image provider by this change; the existing artwork privacy constraints are unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `lesson-character-art`: the default/configured image model must be one the provider actually exposes, and a missing-model rejection must be recorded as an actionable visual failure rather than a raw provider error.

## Impact

- **Code**: `src/lib/env.ts` (default model), `src/server/media/image.ts` (map model-not-found responses to an actionable failure).
- **Configuration/docs**: `.env.example`, `docs/generation.md`.
- **Tests**: `tests/env.test.ts`, `tests/image-provider.test.ts`.
- **Dependencies / APIs / data**: none. No database, route, storage, or request-shape changes.
