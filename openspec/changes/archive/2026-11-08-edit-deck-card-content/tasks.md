# Tasks

## 1. Card editing service

- [x] 1.1 Add `src/server/services/cards.ts` with a validated card-update schema (trimmed non-empty prompt and answer, max 2,000 characters, both `el` and `en`) and `listLessonCards(lessonId)` returning cards in ascending position with both translations; verify with an integration test asserting deck order and locale content.
- [x] 1.2 Implement `updateCardTranslations(lessonId, cardId, input)` in the same service: verify the lesson exists and is `READY`, verify the card belongs to the lesson, and upsert both locale translation rows inside one transaction; verify a valid update changes both rows and returns the saved card.
- [x] 1.3 Add integration coverage in `tests/card-editing.integration.test.ts` for blank/whitespace text, a missing locale, a card from another lesson, an unknown lesson/card, and a non-ready lesson, asserting no translation changes on rejection; verify with `npm run test:integration -- tests/card-editing.integration.test.ts`.

## 2. Admin update API

- [x] 2.1 Add `PATCH /api/admin/lessons/[lessonId]/cards/[cardId]` using `withAdmin(..., { mutation: true })`, delegating to `updateCardTranslations` and returning the saved card; verify `npm run typecheck` passes.
- [x] 2.2 Add route-level integration tests for an unauthenticated request (401), a successful bilingual save (200), invalid input (422), a non-ready lesson (409), and a card outside the lesson (404); verify those cases in `tests/card-editing.integration.test.ts`.

## 3. Teacher editor UI

- [x] 3.1 Add the new editor strings to the `admin` namespace in both `messages/el.json` and `messages/en.json`, including editor title, regeneration warning, per-locale prompt/answer labels, save action, saved/error states, and unavailable/non-ready messages; verify with `npm test -- tests/messages.test.ts`.
- [x] 3.2 Load cards in `src/app/[locale]/admin/lessons/[lessonId]/page.tsx` through `listLessonCards` and render a new client `CardEditor` with serializable card data; verify `npm run typecheck` and that the page shows the editor section for a ready lesson.
- [x] 3.3 Build `src/components/admin/card-editor.tsx` with Greek and English prompt/answer fields per card, per-card saving to the new PATCH route, success/error feedback, the regeneration warning, an unavailable state for no cards, and disabled controls when the lesson is not ready; verify the interactions in the end-to-end test.
- [x] 3.4 Add `e2e/card-editing.spec.ts`: create a lesson, edit a card's Greek and English prompt/answer, reload the admin page and confirm persistence, then open the student deck and confirm the edited text is shown; verify with `npx playwright test e2e/card-editing.spec.ts`.
- [x] 3.5 Document teacher card editing and the regeneration caveat in `docs/generation.md`; verify the documented behavior matches the editor and API.

## 4. Integration verification

- [x] 4.1 Verify card edits leave questions, narration, videos, and card order unchanged by extending the integration test to snapshot those records before and after an update; verify with `npm run test:integration -- tests/card-editing.integration.test.ts`.
- [x] 4.2 Run the broader quality gates `npm run lint`, `npm run typecheck`, and `npm test`; verify all pass.

## Workflow follow-up

- Archive the change after review and successful verification.
