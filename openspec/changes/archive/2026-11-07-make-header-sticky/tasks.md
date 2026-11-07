# Tasks

## 1. Sticky Header Treatment

- [x] 1.1 Add a shared `.app-header` component class in `src/app/globals.css` with sticky positioning, top offset, z-index, near-opaque background, backdrop blur, bottom border, and safe-area top padding, and verify `npm run build` and `npm run lint` pass.
- [x] 1.2 Apply `.app-header` to the public site header and teacher admin header, and verify `npm run typecheck` passes and both headers keep their existing inner layout.
- [x] 1.3 Apply `.app-header` to the student share landing header and student lesson header, and verify both student routes render with the sticky class and unchanged content width.

## 2. Verification

- [x] 2.1 Add `e2e/sticky-header.spec.ts` covering public, admin, student share, and student lesson surfaces, and verify `position: sticky`, a top edge of `0` after scrolling, `z-index >= 40`, and no horizontal overflow at 390 px.
- [x] 2.2 Run the existing i18n, classes, ingestion, and student Playwright suites plus `npm run build`, `npm run typecheck`, and `npm test`, and verify they remain green.

## Workflow follow-up

- Archive the change after review with `openspec archive make-header-sticky`.
- Verify the archived navigation-shell spec exists under `openspec/specs/`.
