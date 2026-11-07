# Tasks

## 1. Narration Normalization

- [x] 1.1 Add `normalizeNarration` under `src/server/generation/` that filters to supplied page numbers, keeps one segment per page using longest combined `el` + `en` script with first-occurrence tie-break, sorts by page number, and returns dropped-segment metadata; verify with unit tests in `tests/generation.test.ts` covering duplicates, identical duplicates, ties, out-of-order input, and out-of-scope pages.
- [x] 1.2 Verify the helper is pure and does not mutate provider arrays by asserting the input remains unchanged in the unit tests and running `npm run typecheck`.

## 2. Narration Pipeline

- [x] 2.1 Call `normalizeNarration` on each chunk's provider result in `src/server/generation/orchestrator.ts` before merging and emit a structured warning with lesson id, dropped count, and affected page numbers; verify with an integration test in `tests/generation.integration.test.ts` using a provider that returns duplicate narration and asserting generation succeeds with one published segment per page.
- [x] 2.2 Update the narration instruction in `src/server/generation/prompts.ts` to list the exact supplied page numbers and require exactly one segment per page with no repeated page numbers, and bump `PROMPT_VERSION` to `v2`; verify with a prompt unit test asserting the page list and single-segment instruction are present.
- [x] 2.3 Update `docs/generation.md` to describe narration normalization and the revised narration validation guarantee; verify the documented behavior matches the unit and integration tests.

## 3. Question Option Contract

- [x] 3.1 Replace `rawQuestionSchema` in `src/server/generation/schemas.ts` with a discriminated union on `type` that requires exactly two options for `TRUE_FALSE` and exactly four for `MULTIPLE_CHOICE` in both locales; verify with unit tests that three-option multiple choice and three-option true/false fail parsing, valid 4/2 questions parse, and the generated JSON schema declares `minItems`/`maxItems` of 2 and 4.
- [x] 3.2 Update the game instruction in `src/server/generation/prompts.ts` to require exactly four options with ids `"a"`–`"d"` for `MULTIPLE_CHOICE` and exactly two with ids `"a"` and `"b"` for `TRUE_FALSE`, replacing the "prefer four-option" wording, and confirm `PROMPT_VERSION` is `v2` from 2.2; verify with a prompt unit test asserting the exact counts and ids for game requests.
- [x] 3.3 Update `docs/generation.md` to document the exact question option counts and the provider-boundary schema enforcement; verify the documented behavior matches the schema and prompt tests.

## 4. Regression and Integration Checks

- [x] 4.1 Add or retain validator unit coverage proving that missing narration, duplicate narration that survives normalization, and questions with the wrong option count still fail artifact validation, and verify the tests pass with `npm test`.
- [x] 4.2 Run `npm run typecheck`, `npm run lint`, and `npm test`, and verify all pass with the new tests included.

## Workflow follow-up

- Archive the change after review with `openspec archive fix-duplicate-narration`.
- Verify the archived `content-generation` spec exists under `openspec/specs/`.
