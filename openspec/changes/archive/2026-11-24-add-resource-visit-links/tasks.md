# Tasks

## 1. Localized labels

- [x] 1.1 Add `admin.resourceVisit` ("Visit" / "Επίσκεψη") and `admin.resourceVisitFor` ("Visit {title}" / "Επίσκεψη: {title}") to `messages/en.json` and `messages/el.json`; verify `npm test -- tests/messages.test.ts` passes with matching key sets.

## 2. Suggestion navigation

- [x] 2.1 In `src/components/admin/resource-manager.tsx`, render the URL of `SUGGESTED` rows as an anchor with `href={resource.url}`, `target="_blank"`, `rel="noopener noreferrer"`, the existing muted `break-all` styling, and `data-testid={`resource-url-${index}`}`; verify the component test asserts these attributes.
- [x] 2.2 Add a Visit action for `SUGGESTED` rows using an anchor styled with `buttonVariants({ variant: "outline", size: "sm" })`, the `ExternalLink` icon, the localized label, `data-testid={`resource-visit-${index}`}`, and `aria-label` from `resourceVisitFor` with the resource title; verify the component test checks href, target, rel, and accessible name.
- [x] 2.3 Confirm suggested rows keep Approve, Dismiss, and Edit working and that `APPROVED` rows render neither the URL anchor nor Visit; verify with a component test asserting `queryByTestId("resource-visit-…")` is absent on the published row.
- [x] 2.4 Update the teacher workflow in `docs/resources.md` to mention opening a suggested resource's link or Visit action before approving; verify the wording matches the shipped labels and behavior.
- [x] 2.5 Extend the suggestion portion of `e2e/lesson-resources.spec.ts` to assert the suggestion URL link and Visit action attributes before approving; verify the spec's selectors match the component test ids.

## 3. Integration checks

- [x] 3.1 Run `npm run typecheck` and `npm run lint` and confirm both pass.
- [x] 3.2 Run `npm test -- tests/resource-manager.test.tsx tests/messages.test.ts` and confirm both new navigation behaviors and unchanged review actions pass.

## Workflow follow-up

- Archive the change after review and a successful apply run.
