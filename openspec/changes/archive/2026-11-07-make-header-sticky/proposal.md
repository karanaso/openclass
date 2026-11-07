# Proposal

## Why

The top navigation currently scrolls out of view on long class, lesson, and results pages, forcing teachers and students to scroll back to the top to reach the locale switcher, admin navigation, logout, or the app home link. Keeping the header visible makes recurring navigation available at every scroll position.

## What Changes

- Make the public site header, teacher admin header, student share landing header, and student lesson header stick to the top of the viewport while scrolling.
- Apply consistent layering, background, border, and backdrop treatment so page content does not show through or overlap the header.
- Account for mobile safe-area insets so the sticky header remains usable on notched devices.
- Preserve the existing header height and document flow; no fixed-position spacer or content offset is introduced.
- Add end-to-end coverage that scrolls the public, admin, and student pages and verifies the header remains at the viewport top.
- Keep the header behavior identical in Greek and English and at phone and desktop widths.

## Capabilities

### New Capabilities

- `navigation-shell`: The persistent top navigation behavior shared by public, admin, and student surfaces, including stickiness, stacking, readability, and mobile safe-area handling.

### Modified Capabilities

None — there are no archived main specs for the current UI shell yet.

## Impact

- Affected components: `src/components/site-header.tsx`, `src/components/admin/admin-header.tsx`.
- Affected pages: student share landing and student lesson pages, which currently render headers inline.
- Possibly a shared header utility/class in `src/app/globals.css` if needed to keep the treatment consistent.
- No API, database, authentication, generated-content, or deployment behavior changes.
- New Playwright coverage in `e2e/`.
