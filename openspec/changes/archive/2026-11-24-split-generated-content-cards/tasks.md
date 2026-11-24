# Tasks

## 1. Localized labels

- [x] 1.1 Add `admin.editContent` ("Edit content" / "Επεξεργασία περιεχομένου") and `admin.editContentHint` (for example "Open an editor to change cards or questions." and its Greek equivalent) to `messages/en.json` and `messages/el.json`; verify `npm test -- tests/messages.test.ts` passes with matching key sets.

## 2. Lesson detail layout

- [x] 2.1 In `src/app/[locale]/admin/lessons/[lessonId]/page.tsx`, remove `<GeneratedContentActions />` from the "Generated content" card header while keeping the `BookOpen` title, `<GeneratedContentCounts />`, results, deck views, and resource count; verify `npm run typecheck` passes.
- [x] 2.2 Add a sibling `Card` after the summary card in the same `grid gap-5 md:grid-cols-2` container with the `Pencil` icon, the `editContent` title, the `editContentHint` line, `<GeneratedContentActions />` in its body, and a stable test hook such as `data-testid="generated-content-actions"`; verify the action buttons still toggle the editors through `tests/generated-content-editor.test.tsx`.
- [x] 2.3 Extend `e2e/card-editing.spec.ts` and `e2e/question-editing.spec.ts` to assert the "Generated content" summary card and the "Edit content" card are both visible and that `edit-cards-button` / `edit-questions-button` render inside the edit actions card; verify with `npm run test:e2e -- e2e/card-editing.spec.ts e2e/question-editing.spec.ts`.
- [x] 2.4 Check the page in `npm run dev` at `/el/admin/lessons/<id>`: the two cards render side by side at the `md` breakpoint, stack on narrow screens, and the editors still open full width below the grid; verify by resizing the viewport.

## 3. Integration checks

- [x] 3.1 Run `npm run typecheck` and `npm run lint` and confirm both pass.
- [x] 3.2 Run `npm test -- tests/generated-content-editor.test.tsx tests/messages.test.ts` and confirm the action toggles and count updates still pass.

## Workflow follow-up

- Archive the change after review and a successful apply run.
