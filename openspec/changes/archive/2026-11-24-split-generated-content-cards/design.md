# Design

## Context

See `proposal.md` - Why. The lesson detail page (`src/app/[locale]/admin/lessons/[lessonId]/page.tsx`) renders a `grid gap-5 md:grid-cols-2` containing the "Original file", "Usage", and "Generated content" cards. The "Generated content" card header currently combines the `BookOpen` title with `<GeneratedContentActions />`, while its body renders `<GeneratedContentCounts />` plus results, deck views, and resource count.

`GeneratedContentActions` and `GeneratedContentCounts` live in `src/components/admin/generated-content-editor.tsx`. The provider owns the active-editor state and the created-item counts; `GeneratedContentEditors` renders the full-width editor below the grid. The action buttons carry `aria-expanded`, `aria-controls`, and the `edit-cards-button` / `edit-questions-button` test ids used by component and Playwright tests. Interface strings live in `messages/en.json` and `messages/el.json`, and `tests/messages.test.ts` requires identical key sets.

## Goals / Non-Goals

**Goals:**

- Give the generated-content summary and the editing entry points distinct, side-by-side cards in the existing grid.
- Reuse the existing provider, actions, counts, and editor rendering without changing editing behavior.
- Keep test ids, `aria-*` attributes, and editor toggle behavior stable so existing tests remain valid.

**Non-Goals:**

- Redesigning the card or question editors or placing the editors side by side.
- Changing counts, API routes, validation, persistence, or student-facing views.
- Reworking the page's overall card grid or moving the other summary cards.

## Decisions

### Add a sibling card inside the existing grid

Replace the single combined card with two `Card`s that occupy consecutive cells of the current `md:grid-cols-2` grid: the "Generated content" summary card first, then the "Edit content" card. On medium and larger screens they render in the same row; on narrow screens they stack. This reuses the existing responsive layout instead of introducing a new nested grid.

- Alternative considered: a dedicated two-column grid wrapping only these two cards. Rejected because it duplicates the page's spacing and could desync from the surrounding cards.
- Alternative considered: move edit actions to the page header. Rejected because the request is specifically about cards side by side.

### Keep the summary card focused

The "Generated content" card keeps its `BookOpen` title plus `GeneratedContentCounts`, results, deck views, and resource count, and drops the action buttons entirely. This makes it match the other summary cards on the page.

### Give the actions card a heading and hint

The new card uses the `Pencil` icon, a localized `editContent` title, and an `editContentHint` line above `<GeneratedContentActions />`. A titled card is easier to scan and gives the actions an accessible context; a card containing only two buttons would look unfinished.

- New keys under the `admin` namespace: `editContent` ("Edit content" / "Επεξεργασία περιεχομένου") and `editContentHint` (for example "Open an editor to change cards or questions.").

### Leave the editor components untouched

`GeneratedContentActions`, `GeneratedContentCounts`, the provider, and `GeneratedContentEditors` keep their current implementation. Only the JSX placement of `GeneratedContentActions` changes. The buttons still toggle the editors, and the editors still render full-width below the grid, where their dense bilingual forms have room.

## Risks / Trade-offs

- **Actions card looks sparse next to a data-dense summary card** → Add the heading and hint, and keep the buttons in the existing `flex flex-wrap` row so the card has structure without new controls.
- **Button row wraps in a half-width card at narrow desktop widths** → `GeneratedContentActions` already uses `flex-wrap`; verify spacing at the `md` breakpoint during apply.
- **Message catalogs drift** → Add both keys to `en.json` and `el.json` and run `tests/messages.test.ts`.
- **Existing tests assume the actions are in the summary card** → Tests query by test ids and roles rather than card structure; confirm the component and e2e specs still pass without selector changes.

## Migration Plan

UI-only change with no data or API migration. Deploy is a normal frontend release; rollback is reverting the commit. No backfill is required.

## Open Questions

None.
