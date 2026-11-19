# Content generation

## Pipeline

```
PDF → extract pages/text → generate topics + cards, questionnaire, game, rubric → publish → READY
```

Extraction uses `unpdf`. A PDF with no selectable text fails with a clear "scanned or image-only PDFs are not supported" message. Page numbers are preserved and every generated item must cite one.

The `GENERATE` stage is implemented in `src/server/generation/orchestrator.ts` and is executed by the BullMQ worker.

## Providers

- `AI_PROVIDER=openai` (default): uses the OpenAI Responses API with strict JSON Schema structured outputs. Requests omit sampling parameters such as `temperature`, which reasoning models reject whenever reasoning effort is not `none`.
- `AI_PROVIDER=mock`: deterministic local content for development and tests. No OpenAI key is required.

Configure the model with `OPENAI_TEXT_MODEL` (default `gpt-4.1-mini`). `gpt-6-luna` is supported. Set the optional `OPENAI_REASONING_EFFORT` (`none`, `low`, `medium`, `high`, `xhigh`, `max`) to choose reasoning effort; when it is unset the field is omitted and the model default applies. Whether a model accepts a given effort and sampling behavior is model-dependent. Prompt version `v4` is recorded on every generation job.

## Generation contract

For each artifact, one structured response contains both locales:

- Topics: `topics {el, en}`, each a small keyword list of at most 8 entries per locale and 40 characters per entry.
- Rubric: `criteria[{id,title{el,en},description{el,en}}]` and `levels[{id,label{el,en},description{el,en}}]`, with 3–6 criteria and 3–4 levels.
- Cards: `itemKey`, `sourcePage`, `prompt {el,en}`, `answer {el,en}`.
- Questions: `itemKey`, `type`, `correctOptionId`, `sourcePage`, `prompt`, `options {el,en}`, `explanation`.
- True/false: exactly two options (`a`, `b`).
- Multiple choice: exactly four options (`a–d`).

Topics are requested once per generation attempt from an evenly sampled excerpt across all pages. Normalization trims, caps, drops empties, and removes case-insensitive duplicates. Topic generation is best-effort: a provider error, timeout, or unusable response is logged and does not fail the lesson; cards, questions, and the game still publish. When a teacher has edited the topics, `topicsEdited` is true and regeneration keeps the edited lists instead of calling the topic provider.

The rubric is requested once after questionnaire generation, using the lesson text, topics, and generated assessment questions so its criteria align with the quiz. Normalization enforces 3–6 criteria, 3–4 levels, 80-character titles/labels, 500-character descriptions, and unique IDs, discarding invalid items. Rubric generation is best-effort and does not block lesson readiness. When a teacher saves an edit, `rubricEdited` is true and regeneration keeps the edited rubric instead of calling the rubric provider.

Answer keys and option ids are locale-independent by construction: the correct option id must exist in both locale option lists. The provider-facing question schema enforces the per-type option counts in both locales; a response with the wrong count fails schema parsing and consumes a generation retry instead of reaching artifact validation. Both the questionnaire and game prompts state the exact counts and ids.

## Validation

Before publication, the content pipeline rejects content when:

- counts fall outside `CARD_MIN/MAX`, `QUESTIONNAIRE_MIN/MAX`, or `GAME_MIN/MAX`,
- a source page does not exist,
- item keys or prompts are duplicated,
- a correct option is missing,
- a question has the wrong number of options for its type,
- locale option ids do not align.

A failed content generation retries up to `GENERATION_MAX_ATTEMPTS` with backoff. Publication is atomic: a failed regeneration leaves the previously published artifacts untouched. A permanent failure marks the lesson `FAILED` and records the reason on the generation job.

## Manual card and question editing

After a lesson is `READY`, the teacher can edit cards and questions in both Greek and English from the lesson detail page. Saves are per item and update both locale variants together; blank or missing text is rejected. Edits take effect for students on their next load and do not change other items or their order.

Regeneration still replaces the whole artifact set. When a new generation is published, manually edited text is discarded, so the editors warn the teacher about this before they edit.

## AI resource suggestions

The lesson admin page has a "Suggest games & videos" action. It sends the lesson title, bilingual topics, and a bounded excerpt of the page text to the provider and asks for up to 8 game/video URLs. Results are stored as normal `LessonResource` rows with source `AI` and status `SUGGESTED`; students never see them until the teacher approves them. The system validates each proposed URL syntactically, derives `LINK`/`YOUTUBE` and the YouTube id, truncates oversized descriptions, and deduplicates against every resource in the lesson, including dismissed ones. No proposal URL is fetched or live-searched. The on-demand suggestion call is logged but is not recorded as a generation job, so it does not appear in lesson token/cost totals.

## Long documents

Page-tagged text is chunked at roughly 48k characters. Each chunk keeps `[Page N]` markers. Per-chunk counts are scaled and merged, then the global count limits are applied before validation.

## Usage and cost

Every content generation job records model, prompt version, input/output tokens, estimated cost, attempts, and errors. Costs use a small per-model price table in `src/server/generation/usage.ts` and are exposed per lesson and per class.

## Configuration

```bash
OPENAI_API_KEY=sk-...
OPENAI_TEXT_MODEL=gpt-6-luna
# Optional; omit to use the model default.
OPENAI_REASONING_EFFORT=low
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
