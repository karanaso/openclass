# Design

## Context

See `proposal.md` — Why. The generation pipeline asks the provider for cards, questions, and narration per page chunk, then validates all merged artifacts before publishing.

Two artifact contracts are currently enforced too late. Narration has a page-cardinality contract — `NarrationSegment` is unique on `(lessonId, pageNumber, locale)` and TTS/render require one segment per page — but the provider schema allows an arbitrary-length segment list, so a compliant response can repeat page numbers. Questions have the opposite problem: the provider schema accepts two to four options, while validation requires exactly four for `MULTIPLE_CHOICE` and exactly two for `TRUE_FALSE`; the game prompt only says four-option questions are preferred. In both cases, recoverable provider variance reaches validation, fails the whole attempt, and retries reproduce the same shape.

## Goals / Non-Goals

**Goals:**

- Make generation succeed when the provider returns duplicate narration segments for a page while publishing only one segment per page.
- Keep the invariant that published narration covers every page with extracted text exactly once.
- Make question option cardinality a provider-schema constraint so malformed multiple-choice questions are rejected before artifact validation.
- Make dropped narration observable and deterministic.
- Keep card generation and the existing retry behavior unchanged.

**Non-Goals:**

- Repairing duplicate cards or questions. Their validation already requires distinct keys and prompts, and they are not page-cardinality artifacts.
- Fabricating, padding, or removing question options to force a valid count.
- Changing the database schema, student UI, or the TTS/video pipeline.
- Adding a second LLM repair call for narration or questions.
- Changing how chunks are formed or how pages are extracted.

## Decisions

### Normalize narration in the orchestrator, not in validation

Add a pure `normalizeNarration(segments, pages)` helper and call it on each chunk's provider result before merging. Validation remains a strict assertion of the published contract.

Rationale: validation should still tell callers when an artifact set is unusable, and direct/unit callers that bypass the orchestrator should not silently publish ambiguous narration. Normalizing before validation keeps the published guarantee while removing provider noise.

Alternative considered: deduplicate inside `validateGeneratedArtifacts`. Rejected because it would hide invalid input from every caller and blur the distinction between "provider output" and "validated artifact".

Alternative considered: retry the provider with a corrective prompt. Rejected as the primary fix because it adds latency and cost and remains non-deterministic; the existing retry loop still applies to genuinely missing narration.

### Keep one narration segment using longest-script, first-occurrence tie-break

For each requested page, consider only segments whose `pageNumber` is in the current chunk. Choose the segment with the greatest combined `el` + `en` script length. If lengths tie, keep the earliest occurrence in provider order. Discard all other segments for that page.

Rationale: longer scripts are more likely to contain usable page narration than empty or truncated duplicates, and the rule is deterministic and cheap. First occurrence preserves the provider's preferred ordering when quality is indistinguishable by length.

Alternative considered: always keep the first segment. Rejected because models sometimes emit a short placeholder before a complete script.

Alternative considered: reject when duplicate scripts differ materially. Rejected because it would reproduce the reported failure for a recoverable condition and require subjective comparison logic.

### Explicitly list required pages in the narration prompt

Update the narration instruction to name the exact supplied page numbers and require exactly one segment for each, with no repeated page numbers. Bump `PROMPT_VERSION` from `v1` to `v2` so generation jobs remain attributable to the prompt that produced them.

Rationale: prompt wording is the cheapest way to reduce duplicate output in the first place. Listing page numbers turns an implicit "one per page" into an explicit checklist. The version bump is a small, already-supported metadata change.

Alternative considered: encode uniqueness in the JSON Schema. JSON Schema draft 7 cannot express "unique by pageNumber" in a way the strict structured-output mode reliably enforces.

### Enforce question option cardinality in the provider schema

Replace the single `rawQuestionSchema` object with a discriminated union on `type`: `TRUE_FALSE` declares two-element option arrays and `MULTIPLE_CHOICE` declares four-element arrays, for both `el` and `en`. Provider responses are parsed with this schema, so a three-option multiple-choice question fails parsing and the existing generation retry loop runs instead of publishing or reaching artifact validation.

Rationale: structured-output schemas constrain generation far more reliably than prompt wording alone, and rejecting at the provider boundary preserves the meaning of artifact validation as a final contract check. It also avoids inventing content.

Alternative considered: keep two-to-four options and pad missing distractors during normalization. Rejected because fabricated options can be factually meaningless and lower assessment quality.

Alternative considered: rely only on a stronger prompt. Rejected because the reported failures show the model already ignores the weaker "prefer" wording across several questions in one response.

Alternative considered: leave validation as the only enforcement. This is the current behavior and the source of the bug.

### Make the game prompt state exact option counts

Update the game instruction to mirror the questionnaire instruction: `MULTIPLE_CHOICE` has exactly four options with ids `"a"`–`"d"`, and `TRUE_FALSE` has exactly two with ids `"a"` and `"b"`. Do not describe four options as merely preferred.

Rationale: the schema enforces the count, and the prompt tells the model the intended shape before it generates. The two layers are complementary; the prompt reduces retries and the schema guarantees the contract.

### Log narration normalization drops without script content

When normalization drops segments, emit `logger.warn` with `lessonId`, the count of dropped segments, and the affected page numbers. Do not log script text, consistent with the existing privacy rule for provider requests.

Rationale: duplicates become visible in operations without leaking lesson content into logs.

## Risks / Trade-offs

- [OpenAI strict structured outputs may handle discriminated unions differently] → Generate the JSON schema with `zodToJsonSchema` and verify it emits `anyOf` branches with `minItems`/`maxItems` of 2 and 4, plus unit tests proving the Zod schema rejects three-option multiple choice and accepts four.
- [Choosing the longest narration script could pick a verbose or repetitive variant] → The choice is deterministic and only applies to duplicates the provider already treated as interchangeable; the existing retry behavior remains available if quality is unacceptable.
- [A chunk-local normalization could miss duplicate page numbers across chunks] → Chunks are disjoint partitions of the page list, and the page table is unique on `(lessonId, pageNumber)`, so cross-chunk duplicates cannot occur for a normal lesson.
- [A question parse failure now retries instead of publishing a partially valid set] → This is intentional; the alternative publishes questions that violate the documented contract. The retry produces a fresh response under prompt `v2` and the stricter schema.
- [Old in-flight jobs may run with prompt `v1`] → Narration normalization is prompt-independent, and the stricter question schema applies immediately, so old jobs still benefit.
- [Dropping out-of-scope narration pages could hide a provider mistake] → The dropped count and page numbers are logged, and unusable citations would otherwise fail the attempt.

## Migration Plan

No data migration is required. Deploy the prompt and schema changes together; existing lesson pages and published artifacts are unchanged. A failed lesson can be retried through the existing retry endpoint after deployment. Rollback restores prompt `v1` and the permissive two-to-four option schema; already published content remains valid.
