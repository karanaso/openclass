# Content generation

## Pipeline

```
PDF → extract pages/text → generate cards, questionnaire, game, narration → publish → TTS → video
```

Extraction uses `unpdf`. A PDF with no selectable text fails with a clear "scanned or image-only PDFs are not supported" message. Page numbers are preserved and every generated item must cite one.

The `GENERATE` stage is implemented in `src/server/generation/orchestrator.ts` and is executed by the BullMQ worker.

## Providers

- `AI_PROVIDER=openai` (default): uses the OpenAI Responses API with strict JSON Schema structured outputs.
- `AI_PROVIDER=mock`: deterministic local content for development and tests. No OpenAI key is required.

Configure the model with `OPENAI_TEXT_MODEL` (default `gpt-4.1-mini`). Prompt version `v2` is recorded on every generation job.

## Generation contract

For each artifact, one structured response contains both locales:

- Cards: `itemKey`, `sourcePage`, `prompt {el,en}`, `answer {el,en}`.
- Questions: `itemKey`, `type`, `correctOptionId`, `sourcePage`, `prompt`, `options {el,en}`, `explanation`.
- True/false: exactly two options (`a`, `b`).
- Multiple choice: exactly four options (`a`–`d`).
- Narration: one segment per page with `script {el,en}`.

Answer keys and option ids are locale-independent by construction: the correct option id must exist in both locale option lists. The provider-facing question schema enforces the per-type option counts in both locales; a response with the wrong count fails schema parsing and consumes a generation retry instead of reaching artifact validation. Both the questionnaire and game prompts state the exact counts and ids.

## Narration normalization

Provider narration is normalized before validation. Segments that cite a page outside the current chunk are discarded, and when several segments cite the same page the segment with the longest combined Greek and English script is kept; ties keep the first occurrence in provider order. Normalized segments are sorted by ascending page number and any dropped segments are logged with their count and affected page numbers.

## Validation

Before publication, the pipeline rejects content when:

- counts fall outside `CARD_MIN/MAX`, `QUESTIONNAIRE_MIN/MAX`, or `GAME_MIN/MAX`,
- a source page does not exist,
- item keys or prompts are duplicated,
- a correct option is missing,
- a question has the wrong number of options for its type,
- locale option ids do not align,
- narration is missing a page or still repeats one after normalization.

A failed generation retries up to `GENERATION_MAX_ATTEMPTS` with backoff. Publication is atomic: a failed regeneration leaves the previously published artifacts untouched. A permanent failure marks the lesson `FAILED` and records the reason on the generation job.

## Manual card editing

After a lesson is `READY`, the teacher can edit any published card's prompt and answer in both Greek and English from the lesson detail page. Saves are per card and update both locale variants together; blank or missing text is rejected. Edits take effect for students on their next deck load and do not change questions, narration, video, or card order.

Regeneration still replaces the whole deck. When a new generation is published, manually edited card text is discarded, so the editor warns the teacher about this before they edit.

## Long documents

Page-tagged text is chunked at roughly 48k characters. Each chunk keeps `[Page N]` markers. Per-chunk counts are scaled and merged, then the global count limits are applied before validation.

## Usage and cost

Every job records model, prompt version, input/output tokens, estimated cost, attempts, and errors. Costs use a small per-model price table in `orchestrator.ts` and are exposed per lesson and per class.

## Configuration

```bash
OPENAI_API_KEY=sk-...
OPENAI_TEXT_MODEL=gpt-4.1-mini
AI_PROVIDER=openai
CARD_MIN=8
CARD_MAX=16
QUESTIONNAIRE_MIN=10
QUESTIONNAIRE_MAX=20
GAME_MIN=10
GAME_MAX=15
GENERATION_MAX_ATTEMPTS=3
DEFAULT_PASS_THRESHOLD=60
```

Keep prompts grounded in supplied text. Do not include student names, attempts, or results in any provider request.
