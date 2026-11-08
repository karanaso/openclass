# Design

## Context

See `proposal.md` for motivation and the delta specs for the behavior contract.

The admin lesson page is a server component that already loads the deck through `listLessonCards` and renders `CardEditor`, a client component that saves one card at a time through `PATCH /api/admin/lessons/[lessonId]/cards/[cardId]`. That route is wrapped in `withAdmin(..., { mutation: true })`, so the teacher session and same-origin checks are shared with every other admin mutation.

`Question` stores mode (`QUESTIONNAIRE` / `GAME`), type, position, correct option id, source page, and a `QuestionTranslation` per locale with `prompt`, JSON `options`, and `explanation`. `publishArtifacts` writes both modes and deletes/recreates all cards and questions on regeneration. Students read the current rows through `loadLessonForStudent`, and grading stores `isCorrect` per `AttemptAnswer` while result feedback is built from the current question rows.

No schema change is needed: all fields required for edit and create already exist, and `@@unique([lessonId, mode, itemKey])` plus `@@index([lessonId, mode, position])` support stable keys and ordering.

## Goals / Non-Goals

**Goals:**

- Add edit actions to the "Generated content" card that open the card and question editors without disturbing the existing grid layout.
- Extend the card editor with creation while preserving its per-card atomic bilingual save.
- Add a question editor with separate questionnaire and game sections, per-question atomic saves, and creation in either mode.
- Enforce the same content invariants for manual questions that generation enforces: exact option counts, aligned ids, a valid correct option, and source pages that exist.
- Keep regeneration, student read paths, and existing admin auth/error handling unchanged.

**Non-Goals:**

- Deleting or reordering cards or questions; inserting a question at an arbitrary position.
- Changing a question's type or mode after creation.
- Preserving manual content across regeneration.
- Snapshotting question content per attempt or regrading historical attempts.
- Optimistic concurrency or edit history; last write wins remains the model.

## Decisions

### Client provider coordinates buttons and editors across the grid

The edit buttons belong in the `Generated content` card header, but the editors need full page width below the two-column grid. A new client `GeneratedContentEditorProvider` wraps the grid and the editor region and owns:

- which editor is open (`cards`, `questions`, or none),
- the displayed card and question counts (initialised from the server render and incremented locally after creation).

A small client `GeneratedContentActions` component inside the card header consumes the provider and renders the two edit buttons with `aria-expanded`/`aria-controls`. A client `GeneratedContentEditors` component after the grid renders the editors when selected. This keeps the existing layout, DOM order, and keyboard order intact instead of moving the card, using a portal, or forcing a full-width grid item.

Keeping the editors always visible was rejected because the request is an explicit edit action. Navigating to a query-string edit mode was rejected because it would re-run the server page and discard unsaved drafts. A modal was rejected because there is no dialog primitive in the project and a full bilingual form is easier to use inline.

### Separate question service and routes, same admin pattern

Add `src/server/services/questions.ts` and:

- `GET`-by-page read through `listLessonQuestions(lessonId)`, called by the server page (no separate read endpoint, matching the card design).
- `POST /api/admin/lessons/[lessonId]/questions` for creation.
- `PATCH /api/admin/lessons/[lessonId]/questions/[questionId]` for updates.

All routes use `withAdmin(..., { mutation: true })`; services throw the existing `NotFoundError`, `ConflictError`, and `ValidationError`, which `toErrorResponse` normalises. Card creation adds `POST /api/admin/lessons/[lessonId]/cards` and a `createCard` function in `cards.ts`.

A single bulk `PUT` for all questions was rejected: it would overwrite questions the teacher did not touch, make partial failures hard to report, and grow the request with every question.

### Question content contract and validation

Both create and update accept:

```json
{
  "correctOptionId": "b",
  "sourcePage": 2,
  "translations": {
    "el": {
      "prompt": "…",
      "options": [{ "id": "a", "text": "…" }, { "id": "b", "text": "…" }],
      "explanation": "…"
    },
    "en": { "prompt": "…", "options": [], "explanation": "…" }
  }
}
```

Creation additionally requires `mode` and `type`; update uses a strict schema so type/mode keys are rejected rather than silently ignored.

Zod enforces trimming, non-empty strings, length caps aligned with generation (`prompt`/`explanation` 6,000, option text 3,000, option id 8), unique option ids, and the option array bounds. Because the update request does not carry the type, the service loads the question and then applies a type-aware check: exactly two options for `TRUE_FALSE`, exactly four for `MULTIPLE_CHOICE`, identical ordered ids across locales, and `correctOptionId` present in both. The same check runs before insert on creation. Source pages must be within `1..pageCount` when the lesson has a page count and must be positive otherwise; this matches the pages offered by generation without requiring `LessonPage` rows to exist for fixtures.

The update runs in a transaction: verify the lesson is `READY`, verify the question belongs to it, update the question row, and upsert both `QuestionTranslation` rows. Any failure rolls back both locales. Card creation follows the same READY and source-page checks and appends with `position = max(position) + 1`; `itemKey` is a server-generated `manual-<uuid>` so it cannot collide with generated keys.

### Type and mode are immutable after creation

The type determines the option count and the student rendering; the mode determines which experience consumes the question. Letting either change would invalidate stored `selectedOptionId` values and move a question between the questionnaire and game without warning. The editor therefore shows type and mode as read-only badges. Changing them means creating a new question, which this change also supports.

### Option ids are canonical and read-only

New questions receive ids `a`, `b` for true/false and `a`–`d` for multiple choice, matching the generator and student UI. The editor edits option text only; it does not expose ids. Existing questions keep whatever aligned ids they already have, but ids are displayed read-only. This makes misaligned ids impossible to produce from the UI while the API still rejects malformed payloads.

### Editing never regrades historical attempts

`Attempt` stores the score, pass status, and per-answer `isCorrect` at submission time. Question edits and creations update only `Question` and `QuestionTranslation`, so stored attempts are untouched; later attempts read the new rows. We explicitly do not snapshot question text per attempt or recompute scores, which would require a migration and a grading-policy decision outside this change.

### UI structure

- `CardEditor` keeps its accordion and per-card save state, gains an "Add card" form (source page plus both locale prompt/answer fields), and appends the returned card to local state after a successful create. The parent-provided counts are incremented through the provider callback.
- `QuestionEditor` renders two stacked sections (Questionnaire, Game) with a position-ordered accordion per question. Each item edits both locale prompts, option texts, explanations, source page, and correct option, and saves one question at a time. Each section has an "Add question" form with a type selector and canonical option rows; the type selector changes the row count for a new question but is absent when editing.
- Both editors reuse `Alert`, `Button`, `Card`, `Input`, `Label`, `Textarea`, and the existing idle/saving/saved/error status pattern. Regeneration warnings live in each editor header.
- New strings are added under the `admin` namespace in both `messages/el.json` and `messages/en.json` to preserve the equal-key-set test.

## Risks / Trade-offs

- **Changing a question causes old result feedback to show current content while stored scores stay historical** → Accepted; the spec guarantees stored attempts are not rewritten, and a content snapshot is deferred to a separate change.
- **Creation can race with regeneration** → The service re-checks `READY` inside the transaction; a regeneration that publishes first makes the create fail or land in the replaced set, matching the documented regeneration-wins behavior.
- **Two teachers saving the same question** → Last write wins, consistent with the existing card editor; no revision field is added for a single-teacher admin surface.
- **Canonical option ids limit reordering** → Option order is the array order; teachers can change texts but not ids. Fine for this scope and eliminates a class of invalid payloads.
- **Large question sets make a long editor** → Both editors use collapsed accordions and render from one read; no per-item query.
- **Counts are updated locally after creation** → A page reload remains the source of truth; local increments avoid a full server refresh that would reset editor state.

## Migration Plan

No database migration. Deploy the services, routes, page data load, components, and message keys together. Rollback removes the new routes and UI; existing cards, questions, and student behavior remain valid because no data shape changed and manual writes use the same tables.
