# Design

## Context

See `proposal.md` for motivation. The legacy character-art path is unchanged in shape:

- `src/lib/env.ts` parses `OPENAI_IMAGE_MODEL` with a hard-coded default and exposes it through `getEnv()`.
- `src/server/media/image.ts` posts to `https://api.openai.com/v1/images/generations` with `model`, `prompt`, `n`, `size`, `quality`, `output_format`, and optional `background: "transparent"`.
- `src/server/media/lesson-visual.ts` records `model`, `imageQuality`, `promptVersion`, and failures on `LessonVisual`; a visual failure already leaves the lesson and video usable.

The configured account returns HTTP 200 from `GET /v1/models` but does not list `gpt-image-1`; it does list `gpt-image-1-mini`, along with newer `gpt-image-*` models. The current default therefore fails every character generation with a raw provider 400.

## Goals / Non-Goals

**Goals:**

- Make the out-of-the-box image model one the configured account exposes.
- Keep `OPENAI_IMAGE_MODEL` as the single operator override without changing the request shape.
- Turn a model-not-found rejection into an actionable visual failure that names the model and the variable.
- Keep documentation and tests aligned with the new default.

**Non-Goals:**

- Supporting a configurable image base URL or a non-OpenAI gateway.
- Migrating prompts, quality, sizes, sprite slicing, or video composition.
- Adding a startup network preflight against `GET /v1/models`.
- Changing how visual failures affect lessons or videos.

## Decisions

### 1. Pin `gpt-image-1-mini` as the default

Set the `OPENAI_IMAGE_MODEL` default to `gpt-image-1-mini`.

- Verified on the configured account: `GET /v1/models` lists `gpt-image-1-mini` and not `gpt-image-1`.
- It uses the same Images API fields the current code already sends, including `quality` and transparent `background`.
- It is already documented as the lower-cost image option, so the default stays conservative.

Alternatives considered:

- `gpt-image-2` / `gpt-image-2.5-*`: present on the account and likely higher fidelity, but newer, less proven with the current sprite-sheet pipeline, and potentially different in price and parameter support. Operators can opt in explicitly.
- Requiring `OPENAI_IMAGE_MODEL` with no default: removes the broken default but makes a fresh checkout fail configuration parsing instead of working out of the box.
- A runtime lookup of `/v1/models` to pick a model: adds a network dependency and key-scope requirement to image generation and still needs a fallback.

### 2. Map model-not-found to an actionable failure

In `OpenAIImageProvider.generate`, inspect a non-OK response before converting it to a generic error. When the status is 400 and the body matches an unknown/missing-model message, throw an `AppError` with code `image_model_unavailable`, HTTP status 500, and a message naming the configured model and `OPENAI_IMAGE_MODEL`.

- `lesson-visual` already catches generation errors and records the message on `LessonVisual.lastError`/`error`, so the teacher sees the actionable reason.
- The existing failure isolation is preserved: the lesson stays usable and video rendering continues without the character.
- Other provider errors keep their current behavior and message.
- Alternative: validate the model at startup. Rejected because the key may not have model-list scope at boot, the account can change after deploy, and a generation-time error already has a durable place to surface.

### 3. Keep the request shape and configuration surface unchanged

Only the default value and error mapping change. `IMAGE_PROVIDER`, `OPENAI_IMAGE_QUALITY`, the endpoint, and the request body stay as they are. This keeps the change reversible and avoids touching the sprite-sheet contract.

## Risks / Trade-offs

- **`gpt-image-1-mini` may reject a field the current code sends** → Verify one scene and one transparent character-sheet request during implementation; if a field is unsupported, keep the request-shape fix separate or let the operator pin a model that accepts it.
- **Accounts and gateways expose different model lists** → The default is verified for this account; the actionable error and documented override make another environment fixable without a code change.
- **An explicit deployment override may still say `gpt-image-1`** → Document that existing `OPENAI_IMAGE_MODEL` values must be updated; the new default only applies when the variable is unset.
- **Model-not-found detection is message-based** → Match a small, documented set of model-related phrases on HTTP 400 and otherwise preserve the original error text; add a test for both mapped and unmapped errors.

## Migration Plan

1. Change the default and the error mapping.
2. Update `.env.example` and `docs/generation.md`, including how to verify a model with `GET /v1/models`.
3. Update tests and run the image-provider, env, and typecheck suites.
4. Rollback: revert the default or set `OPENAI_IMAGE_MODEL` to a model the account exposes; no data migration is involved.
