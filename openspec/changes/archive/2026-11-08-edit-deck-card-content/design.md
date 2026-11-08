# Design

## Context

See `proposal.md` for motivation and `specs/card-editing/spec.md` for the behavior contract.

The current data model already supports the feature without migration: `Card` stores order and source page, and `CardTranslation` stores one `prompt` and `answer` per locale (`el`, `en`). Students read cards through `loadLessonForStudent`, which resolves the requested locale with the lesson's primary locale as fallback. The generated deck is replaced wholesale by `publishArtifacts` on regeneration and only reaches `READY` after publication.

The admin lesson detail page is a server component authenticated by the admin layout. Mutating admin routes use `withAdmin(..., { mutation: true })`, which enforces the teacher session and same-origin checks; validation and API errors are normalized by `toErrorResponse`.

## Goals / Non-Goals

**Goals:**

- Read the published deck into the lesson page with both locale variants.
- Update one card's Greek and English prompt/answer atomically through an authenticated admin API.
- Keep the change additive: no schema migration, no effect on generation, questions, narration, videos, or student read paths.
- Make the regeneration caveat visible to the teacher.

**Non-Goals:**

- Creating, deleting, or reordering cards.
- Editing source page attribution, questionnaire/game questions, narration, or videos.
- Preserving manual edits across regeneration or adding an edit history/audit trail.
- Student-side editing or collaborative concurrent editing.

## Decisions

### Per-card PATCH endpoint

Add `PATCH /api/admin/lessons/[lessonId]/cards/[cardId]` accepting:

```json
{
  "translations": {
    "el": { "prompt": "…", "answer": "…" },
    "en": { "prompt": "…", "answer": "…" }
  }
}
```

It returns the saved card with its translations. A per-card save keeps the request small, limits the blast radius of a bad save, and matches the editor flow. A bulk deck `PUT` was rejected because it would overwrite cards the teacher did not edit and would make partial failures harder to communicate.

### Read through the server component, write through an API

Add `listLessonCards(lessonId)` to a card service and call it from the admin lesson page; pass a serializable `{ id, position, sourcePage, translations: { el, en } }` array to a client editor. A separate admin `GET` endpoint is unnecessary because the page is already authenticated and server-rendered. The mutation needs an HTTP route because saving happens interactively in the client.

### One atomic bilingual update

Use Zod to require a trimmed, non-empty prompt and answer (max 2,000 characters) in both `el` and `en`. Inside `prisma.$transaction`, verify the lesson exists and is `READY`, verify the card belongs to that lesson, then `upsert` both `CardTranslation` rows. Requiring both locales in one transaction prevents a card from showing one updated language and one stale language. Per-locale save endpoints were rejected for that reason.

Invalid input returns `422` through the existing Zod handling. A missing lesson or card returns `404`. A lesson that is not `READY` returns `409 Conflict`, since the deck is either not published yet or is being replaced.

### No schema change, last write wins

`CardTranslation` already has the needed unique key `[cardId, locale]`. Adding `updatedAt`/revision fields was considered for optimistic concurrency but rejected: this is a single-teacher admin surface and the added migration and conflict UI are not justified. Concurrent saves resolve as last-write-wins.

The edit transaction reads the lesson status before writing, so a regeneration that publishes afterward still replaces the edited deck as documented. If regeneration deletes the card first, the update fails with `404` rather than recreating it.

### Editor component

Add `src/components/admin/card-editor.tsx` as a client component using the existing `Card`, `Button`, `Label`, and input primitives. It lists cards in deck order, shows position, and exposes Greek and English prompt/answer fields per card. Each card has its own save control with idle/saving/saved/error state. The component warns that regeneration discards manual edits. When the lesson is not `READY`, the fields and save controls are disabled with a status message; when no cards exist, it shows the unavailable state.

New strings go under the `admin` namespace in both `messages/el.json` and `messages/en.json`, preserving the existing equal-key-set test.

## Risks / Trade-offs

- **Manual edits are lost on regeneration** → The editor states this explicitly; regeneration remains a full replacement by design.
- **Last-write-wins can overwrite another browser's save** → Accepted for a single-teacher surface; a revision field can be added later without changing the endpoint contract's intent.
- **Status guard can race with a regeneration that publishes just after the check** → The documented behavior is that the regenerated deck wins; the edit either lands before replacement or fails as not found.
- **Large decks make a long page** → Render each card as a compact, collapsible section in deck order; no extra query per card.
- **Card text is user-authored** → Render it as text, not HTML, and enforce length limits; existing React escaping prevents markup injection.

## Migration Plan

No database migration. Deploy the service, route, page data load, component, and translations together. Rollback removes the new UI and route; card data remains valid and unchanged because no schema or generated content is modified. The feature is additive and can ship without backfilling anything.
