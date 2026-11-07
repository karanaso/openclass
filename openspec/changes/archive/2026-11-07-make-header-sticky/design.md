# Design

## Context

See `proposal.md` for motivation and `specs/navigation-shell/spec.md` for the behavior contract.

The app has four top-level headers:

- `src/components/site-header.tsx` — public site and login
- `src/components/admin/admin-header.tsx` — teacher admin
- `src/app/[locale]/s/[token]/page.tsx` — student share landing
- `src/app/[locale]/s/[token]/lesson/[lessonId]/page.tsx` — student lesson

All currently render as normal document flow with slightly different backgrounds (`bg-card/70`, `bg-card/80`). There is no shared header style. Pages are ordinary scrollable documents with no overflow-hidden ancestor around the headers, and Tailwind CSS is the styling system.

## Goals / Non-Goals

**Goals:**

- One consistent sticky treatment across all four headers.
- Zero content offset or layout jump when stickiness activates.
- Readable header over passing content.
- Mobile safe-area awareness.
- One Playwright contract test that covers public, admin, and student surfaces.

**Non-Goals:**

- Redesigning navigation, adding menus, or changing header links.
- Hide-on-scroll, shrink-on-scroll, or auto-hide behavior.
- A shared React header component; the headers intentionally differ in content and width.
- Changing page content widths, spacing, or typography.
- Anchor-link offset handling beyond what the current app uses.

## Decisions

### Use `position: sticky` rather than `position: fixed`

Sticky keeps the header in normal flow, so its height is reserved automatically and the first content block never needs a manual spacer. Fixed positioning would require a body offset and would risk double-spacing across four different layouts.

Alternative considered: fixed header with a global `padding-top` on `body`. Rejected because the header heights differ slightly and future header changes would silently overlap content.

### Centralize the treatment in one CSS component class

Add a small `.app-header` class in `src/app/globals.css` under `@layer components` and apply it to all four headers. It contains the sticky positioning, top offset, z-index, border, near-opaque background, backdrop blur, and safe-area padding. Centralizing avoids four copies drifting over time while still allowing each header to keep its own inner layout.

Alternative considered: a shared React component. Rejected because the public, admin, and student headers have different max widths, links, and controls; wrapping them would add indirection without removing meaningful markup.

### Stacking and readability

Use `z-index: 50` and a near-opaque background (`bg-card/95`) plus `backdrop-blur-md`. The background alone remains readable where backdrop blur is unsupported. The existing bottom border is retained as the visual separator.

Alternative considered: fully transparent header with heavy blur. Rejected because scrolling text behind it reduces contrast, especially for small locale controls.

### Safe-area padding on the header itself

Apply `padding-top: env(safe-area-inset-top, 0px)` to the header. Because sticky headers reserve their height, the extra inset naturally pushes content down on notched devices and collapses to zero elsewhere.

Alternative considered: ignoring safe areas. Rejected because the header would sit under a notch/cutout on iOS devices in standalone or full-screen contexts.

### Keep the header's existing height and inner padding

The change adds only positioning, background, and safe-area padding. It does not alter the `py-3` inner spacing, logo size, or controls, so the visual regression surface is small.

### Test the computed behavior, not screenshots

Playwright will scroll each surface and assert:

- `getComputedStyle(header).position === "sticky"`
- the header's bounding box top is at `0` after scrolling
- `z-index` is at least 40
- at 390 px width the header remains visible and no horizontal overflow appears

This is stable across fonts and rendering differences.

## Risks / Trade-offs

- **A future ancestor with `overflow: hidden` or `overflow: auto` breaks sticky** → Keep the header a direct child of the page shell; note this constraint in a comment near the header class.
- **Backdrop blur costs GPU on low-end phones** → Use a modest blur and a near-opaque background so rendering remains acceptable even if blur is disabled by the browser.
- **Safe-area padding changes header height on some devices** → Sticky flow reserves the height automatically; test the normal case and document the env-based behavior.
- **Very short viewports leave little room for content** → The header keeps its existing compact height and does not grow beyond the safe-area inset.
- **Anchor links can land under the header in future content** → Out of scope for this change; if anchors are added, add `scroll-margin-top` at that time.

## Migration Plan

No data or API migration. Deploy the web image as usual. Rollback is a CSS/class revert with no stored state implications.

## Open Questions

None.
