# Proposal

## Why

Lesson generation fails for otherwise valid PDFs when provider output violates an artifact's cardinality contract. Narration can repeat a page (`duplicate narration for page 1; duplicate narration for page 2; duplicate narration for page 2`), and `MULTIPLE_CHOICE` game questions can arrive with fewer than four options (`game q8 multiple choice must have exactly four options; game q9 ...; game q10 ...`). The narration prompt cannot express uniqueness by page number, and the game prompt only says to "prefer" four options while the provider schema permits two to four. Retries reproduce the same shape, so usable content is rejected and the lesson is left `FAILED`.

## What Changes

- Normalize provider narration output before validation: group segments by page number, select one deterministic segment per supplied page, and discard segments that cite pages outside the current chunk.
- Keep exactly one narration segment per page: prefer the greatest combined Greek and English script length, breaking ties by first occurrence in provider order, so useful narration is not lost and the result is deterministic.
- Expose how many duplicate or out-of-scope narration segments were dropped through structured logging so silent data loss is observable.
- Strengthen the narration prompt to list the exact page numbers supplied in the request and require exactly one segment per listed page, with no repeated page numbers.
- Enforce question option cardinality at the provider schema boundary: `MULTIPLE_CHOICE` requires exactly four options in each locale and `TRUE_FALSE` requires exactly two, so malformed provider output fails schema parsing and uses the existing retry loop instead of reaching artifact validation.
- Update the game prompt to state the exact option counts and ids rather than saying four-option questions are merely preferred.
- Bump the generation prompt version so jobs recorded before and after the change remain distinguishable.
- Keep validation strict for the published artifact contract: after normalization there must be exactly one narration segment per source page, and missing narration, unresolved duplicates, or questions with the wrong option count continue to fail generation.
- Update generation documentation and add unit/integration coverage for duplicate, out-of-order, and out-of-scope narration plus question option cardinality.

## Capabilities

### New Capabilities

- `content-generation`: The contract for turning extracted lesson pages into validated bilingual cards, questionnaire items, game questions, and per-page narration, including how provider output is constrained and normalized before publication.

### Modified Capabilities

None — no archived capability specs exist yet.

## Impact

- Affected code: `src/server/generation/schemas.ts`, `src/server/generation/prompts.ts`, `src/server/generation/orchestrator.ts`, `src/server/generation/validate.ts`, and a new narration normalization helper under `src/server/generation/`.
- Affected behavior: generation succeeds when the provider emits duplicate narration for a page; published narration still contains exactly one segment per page; malformed multiple-choice questions are rejected at the provider boundary and retried instead of failing artifact validation.
- Affected documentation: `docs/generation.md`.
- Affected tests: `tests/generation.test.ts` and `tests/generation.integration.test.ts`.
- No API shape, database schema, authentication, student experience, media pipeline, or deployment changes.
