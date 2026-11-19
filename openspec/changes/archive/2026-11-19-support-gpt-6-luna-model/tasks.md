# Tasks

## 1. Configuration and documentation

- [x] 1.1 Add optional `OPENAI_REASONING_EFFORT` to `src/lib/env.ts` as an enum of `none`, `low`, `medium`, `high`, `xhigh`, and `max`; extend `tests/env.test.ts` to accept each supported value, reject an unknown value, and confirm the field is absent by default; verify with `npx vitest run tests/env.test.ts`.
- [x] 1.2 Update `.env.example` and `docs/generation.md` with the `gpt-6-luna` example, the optional `OPENAI_REASONING_EFFORT` setting, and the rule that reasoning models reject `temperature`; update the `docs/operations.md` spend note; verify every documented variable and default matches `src/lib/env.ts`.

## 2. Provider request and cost accounting

- [x] 2.1 Remove `temperature` from the Responses request body in `src/server/generation/openai-provider.ts` and send `reasoning: { effort }` only when `OPENAI_REASONING_EFFORT` is set; add provider tests asserting the body has no `temperature`, omits `reasoning` when unset, and carries the configured effort when set; verify with `npx vitest run tests/openai-provider.test.ts`.
- [x] 2.2 Add `gpt-6-luna` at $0.10 input / $0.50 output per 1M tokens to `src/server/generation/usage.ts`; add `tests/usage.test.ts` covering its estimate and the unchanged unknown-model fallback; verify with `npx vitest run tests/usage.test.ts`.
- [x] 2.3 Normalize `strictify` to drop empty `not` nodes and flatten single-branch `anyOf`, so nullable rubric and resource-suggestion fields produce typed schema branches; verify the rubric `id` fixture no longer contains `{"not":{}}`.
- [x] 2.4 Add `tests/strictify.test.ts` covering the nullable fixture and every artifact schema; verify no artifact schema contains empty object subschemas or untyped `anyOf` branches with `npx vitest run tests/strictify.test.ts`.

## 3. Integration verification

- [x] 3.1 Run `npm run typecheck`, `npm run lint`, and `npm test`; verify all pass with no regressions.
- [x] 3.2 With the configured key and `OPENAI_TEXT_MODEL=gpt-6-luna`, regenerate one lesson and confirm topics, cards, questionnaire, game, and rubric complete without a 400 and that the generation job records `gpt-6-luna` plus a cost derived from the new rates; if a response ends incomplete from reasoning tokens, record the needed `max_output_tokens` or effort adjustment.

## Workflow follow-up

- Run `openspec validate --strict "support-gpt-6-luna-model"`.
- Archive the change after implementation and review are complete.
