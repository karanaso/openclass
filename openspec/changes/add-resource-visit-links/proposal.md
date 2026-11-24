# Proposal

## Why

In the lesson admin resource review queue, suggested resources show their URL as inert text. A teacher must copy the URL into a new browser tab before deciding whether to approve or dismiss it. Making the URL activatable and adding an explicit **Visit** action removes that friction and supports faster, better-informed review of AI- and extraction-suggested links.

## What Changes

- Render the stored URL of each `SUGGESTED` resource in the admin review queue as a link that opens in a new tab with `noopener noreferrer`.
- Add a **Visit** button to each suggested resource row that opens the same URL in a new tab, labelled for assistive technology with the resource title.
- Add localized `Visit` and per-resource accessible-label strings for English and Greek.
- Keep approval, dismissal, and editing behavior unchanged; only navigation affordances are added.
- Scope the new affordances to the Suggestions section. Published resource rows keep their current presentation (recorded assumption; their URLs are already reachable from the student view).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `lesson-resources`: adds a requirement that teachers can navigate from a suggested resource in the review queue to its stored URL in a new tab, both from the URL text and from an explicit Visit action.

## Impact

- `src/components/admin/resource-manager.tsx` — shared row renderer for suggested resources.
- `messages/en.json` and `messages/el.json` — new admin strings under the `admin` namespace.
- `tests/resource-manager.test.tsx` — component coverage for link and Visit button behavior.
- `e2e/lesson-resources.spec.ts` — end-to-end assertion on the suggestion review queue (optional, if existing flow exposes a suggestion).
- No API, data model, dependency, or student-facing changes.
