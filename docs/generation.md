# Content generation

## Pipeline

```
PDF → extract pages/text → generate cards, questionnaire, game → publish → READY

teacher requests a locale → narration scripts → TTS → video
```

Extraction uses `unpdf`. A PDF with no selectable text fails with a clear "scanned or image-only PDFs are not supported" message. Page numbers are preserved and every generated item must cite one.

The `GENERATE` stage is implemented in `src/server/generation/orchestrator.ts` and is executed by the BullMQ worker.

## Providers

- `AI_PROVIDER=openai` (default): uses the OpenAI Responses API with strict JSON Schema structured outputs.
- `AI_PROVIDER=mock`: deterministic local content for development and tests. No OpenAI key is required.

Configure the model with `OPENAI_TEXT_MODEL` (default `gpt-4.1-mini`). Prompt version `v2` is recorded on every generation job.

## Art-direction brief

Before a lesson's video artwork is generated, the worker asks `OPENAI_ART_DIRECTION_MODEL` (defaults to `OPENAI_TEXT_MODEL`, normally `gpt-4.1-mini`) for a small, schema-validated brief: subject, setting, mood, palette, character role/form/outfit/props, and scene composition. The brief is built from the lesson title and a bounded page-text excerpt and is stored on `LessonVisual`.

If the text call fails, the worker uses a deterministic fallback brief and records `artBriefFallback=true`; artwork generation continues. No student data enters the brief.

There is no OpenAI model named `gpt-4-mini`. Use `gpt-4.1-mini` for the brief and keep `gpt-image-1` at `high` quality for the final artwork. `gpt-image-1-mini` is an explicit lower-cost, lower-fidelity image option.

## Generation contract

For each artifact, one structured response contains both locales:

- Cards: `itemKey`, `sourcePage`, `prompt {el,en}`, `answer {el,en}`.
- Questions: `itemKey`, `type`, `correctOptionId`, `sourcePage`, `prompt`, `options {el,en}`, `explanation`.
- True/false: exactly two options (`a`, `b`).
- Multiple choice: exactly four options (`a–d`).

Narration is not part of content generation. It is prepared by the manual `NARRATION` stage when a teacher requests a video variant. Answer keys and option ids are locale-independent by construction: the correct option id must exist in both locale option lists. The provider-facing question schema enforces the per-type option counts in both locales; a response with the wrong count fails schema parsing and consumes a generation retry instead of reaching artifact validation. Both the questionnaire and game prompts state the exact counts and ids.

## Narration preparation

Content generation never calls the narration provider. When a teacher requests a video variant, the `NARRATION` stage loads the lesson pages and prepares one script per page for both Greek and English.

- Provider narration is normalized: out-of-scope pages are discarded, the longest duplicate for a page is kept, and segments are ordered by ascending page number.
- Existing complete scripts are reused. Only pages missing either locale are requested.
- If the first pass omits a page, the stage makes one targeted repair request for only the missing pages.
- If a page is still missing after repair, the requested locale's video variant is marked `FAILED` and the lesson stays `READY`.
- Dropped segments are logged with their count and affected page numbers.

## Validation

Before publication, the content pipeline rejects content when:

- counts fall outside `CARD_MIN/MAX`, `QUESTIONNAIRE_MIN/MAX`, or `GAME_MIN/MAX`,
- a source page does not exist,
- item keys or prompts are duplicated,
- a correct option is missing,
- a question has the wrong number of options for its type,
- locale option ids do not align.

A failed content generation retries up to `GENERATION_MAX_ATTEMPTS` with backoff. Publication is atomic: a failed regeneration leaves the previously published artifacts untouched. A permanent failure marks the lesson `FAILED` and records the reason on the generation job. A successful publication clears stale narration rows so the next video request prepares scripts from the current pages.

## Manual card editing

After a lesson is `READY`, the teacher can edit any published card's prompt and answer in both Greek and English from the lesson detail page. Saves are per card and update both locale variants together; blank or missing text is rejected. Edits take effect for students on their next deck load and do not change questions, narration, video, or card order.

Regeneration still replaces the whole deck. When a new generation is published, manually edited card text is discarded, so the editor warns the teacher about this before they edit.

## Long documents

Page-tagged text is chunked at roughly 48k characters. Each chunk keeps `[Page N]` markers. Per-chunk counts are scaled and merged, then the global count limits are applied before validation.

## Usage and cost

Every content and narration job records model, prompt version, input/output tokens, estimated cost, attempts, and errors. Costs use a small per-model price table in `src/server/generation/usage.ts` and are exposed per lesson and per class.

## Configuration

```bash
OPENAI_API_KEY=sk-...
OPENAI_TEXT_MODEL=gpt-4.1-mini
OPENAI_ART_DIRECTION_MODEL=gpt-4.1-mini
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_QUALITY=high
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
