# Proposal

## Why

On the lesson detail page, the "Generated content" card currently mixes lesson statistics (card/question counts, results, deck views, resources) with the entry points for the card and question editors. The two edit actions crowd the summary heading and make the card look different from the other summary cards. Splitting the summary from the edit controls gives each a clear purpose and makes the editing entry points easier to find.

## What Changes

- Keep a "Generated content" card that shows only the generated-content summary: card count, question count, results, deck views, and resource count.
- Add a separate "Edit content" card beside it (in the same two-column grid) that holds the "Edit cards" and "Edit questions" actions.
- Add localized `editContent` and `editContentHint` strings for English and Greek.
- Keep the editors hidden until their action is used, keep them rendering full-width below the grid, and keep the existing toggle, `aria-expanded`, `aria-controls`, and test-id behavior unchanged.
- No change to editing, validation, persistence, or student-facing behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `card-editing`: the card edit action moves from the "Generated content" heading into a separate "Edit content" card beside the "Generated content" summary; the editor visibility behavior is unchanged.
- `question-editing`: the question edit action moves from the "Generated content" heading into the same separate "Edit content" card; the editor visibility behavior is unchanged.

## Impact

- `src/app/[locale]/admin/lessons/[lessonId]/page.tsx` — split the single card into a summary card and an edit-actions card.
- `src/components/admin/generated-content-editor.tsx` — `GeneratedContentActions` keeps its markup and is rendered from the new card.
- `messages/en.json` and `messages/el.json` — new `admin` strings.
- `tests/generated-content-editor.test.tsx`, `tests/messages.test.ts` — existing coverage still applies; message parity must hold.
- `e2e/card-editing.spec.ts` and `e2e/question-editing.spec.ts` — action test ids and editor behavior are unchanged, so no selector updates are expected.
- No API, data model, dependency, or student-facing changes.
