# Design

## Context

See proposal.md - Why. The teacher review queue and published list are both rendered by `ResourceManager` in `src/components/admin/resource-manager.tsx` through one shared `renderRow` function. Today the stored URL is a plain `<p>` on every row, and action buttons come from the local `Button` component, which renders only a `<button>` and has no `asChild` support. The in-flight `add-wordpress-article-generation` change also edits this component for article resources, so the new controls must not disturb its `ARTICLE` source and URL-lock behavior. Interface strings live in `messages/en.json` and `messages/el.json`.

## Goals / Non-Goals

**Goals:**

- Let a teacher inspect a suggested resource's destination from the review queue in one action.
- Keep the change local to the admin review UI, its translations, and its tests.
- Match existing link-safety conventions (`target="_blank"` with `noopener noreferrer`).

**Non-Goals:**

- Changing student resource presentation or the student payload.
- Changing URL validation, extraction, AI proposal generation, or review status transitions.
- Adding link previews, metadata fetches, or destination health checks.

## Decisions

### Gate the new controls on `SUGGESTED` status

`renderRow` renders both sections, so the URL anchor and Visit action are emitted only when `resource.status === "SUGGESTED"`. Approved rows keep the current plain-text URL and action set.

- Why: matches the requested scope and avoids changing the published list without a product decision.
- Alternative considered: apply both affordances to every row. Rejected because the request is specifically about reviewing suggestions; extending it later is a one-condition change.

### URL text becomes an anchor

Replace the suggestion URL `<p>` with an `<a href={resource.url} target="_blank" rel="noopener noreferrer">`, preserving the small muted, `break-all` styling and adding a hover underline for affordance.

- Why: the visible URL is the most direct target and requires no extra chrome.
- Alternative considered: only add the button. Rejected because the request explicitly asks for a clickable link.

### Visit is a link styled with `buttonVariants`, not a `Button`

Render `<a className={buttonVariants({ variant: "outline", size: "sm" })} ...>` with the `ExternalLink` icon and the localized Visit label. Do not add `asChild` support to `Button` for this change.

- Why: a navigation control must be a real link so middle-click, open-in-new-tab, and copied link addresses work; extending the shared button API is unnecessary scope.
- Alternative considered: `onClick` with `window.open`. Rejected for popup blocking and accessibility reasons.

### Localization keys under `admin`

Add `resourceVisit` ("Visit" / "Επίσκεψη") and `resourceVisitFor` ("Visit {title}" / "Επίσκεψη: {title}"). The anchor uses `aria-label={t("resourceVisitFor", { title: resource.title })}` while showing the short visible label, so repeated Visit buttons remain distinguishable to screen readers.

### Stable test hooks

Use `resource-url-{index}` for the URL anchor and `resource-visit-{index}` for the Visit action. Component tests assert `href`, `target`, `rel`, accessible name, and that both controls are absent on approved rows.

## Risks / Trade-offs

- **Scope inconsistency**: only review rows gain Visit, so published rows look different. → Accepted and recorded in proposal.md; extending scope is a follow-up.
- **Merge conflict with the article change**: both touch `resource-manager.tsx` and the message files. → Keep edits additive and localized to `renderRow` and the `admin` message blocks; rebase after the article change lands.
- **Long or opaque URLs in the action bar**: the URL anchor uses `break-all` and the Visit label stays short. → Verify layout in the existing component test render and visually during apply.
- **Unverified AI destinations**: clicking may reach a dead or unexpected page. → Existing unverified labeling stays in place; navigation remains teacher-initiated and no URL is fetched on render.

## Migration Plan

No data or API migration. Deploy is a UI-only change; rollback is reverting the commit. Existing stored URLs need no backfill because they are already validated HTTP/HTTPS addresses.
