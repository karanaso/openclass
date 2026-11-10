# Tasks

## 1. Pin the verified default model

- [x] 1.1 Change the `OPENAI_IMAGE_MODEL` default in `src/lib/env.ts` from `gpt-image-1` to `gpt-image-1-mini`; update the expectation in `tests/env.test.ts`; verify with `npx vitest run tests/env.test.ts`.
- [x] 1.2 Update `.env.example` and the image configuration in `docs/generation.md` to show `gpt-image-1-mini` as the default, state that the value must name a model the configured account exposes, and include the `GET https://api.openai.com/v1/models` check; verify every documented variable and default matches `src/lib/env.ts`.

## 2. Make a missing model actionable

- [x] 2.1 In `src/server/media/image.ts`, map a non-OK 400 whose body reports an unknown/missing model to `AppError("image_model_unavailable", ...)` naming the configured model and `OPENAI_IMAGE_MODEL`, while preserving the existing message for other provider errors; verify with `tests/image-provider.test.ts` cases for a model-not-found 400 and an unrelated 400.
- [x] 2.2 Add an image-provider test asserting the default character-sheet request uses `gpt-image-1-mini` with `quality=high`, `output_format=png`, and `background=transparent`; verify with `npx vitest run tests/image-provider.test.ts`.
- [x] 2.3 Confirm the visual path records the mapped failure without failing the lesson: verify with a focused `lesson-visual` test or by checking `LessonVisual.lastError/error` in the existing visual failure test.

## 3. Integration verification

- [x] 3.1 Run `npm run typecheck`, `npm run lint`, and `npm test`; verify all exit successfully with no regressions.
- [x] 3.2 With the configured key, confirm `GET /v1/models` lists `gpt-image-1-mini` and one scene plus one character-sheet generation succeeds through the image provider; verify the stored `LessonVisual.model` is `gpt-image-1-mini`.

## Workflow follow-up

- Run `openspec validate --strict "fix-image-model-config"`.
- Archive the change after implementation and review are complete.
