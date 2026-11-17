# Design

## Context

- The student lesson page is a client tab switcher (`src/components/student/lesson-tabs.tsx`) fed by `loadLessonForStudent` (`src/server/student/lesson-data.ts`). Tabs are selected from a local union and defaulted to the first available mode; the active tab is mirrored into `?tab=`.
- Every lesson keeps its uploaded PDF in private storage via `Lesson.storageKey`. Existing student media routes authenticate with `requireStudentContext` and `assertLessonInShare` and stream through `serveStoredMedia`, which already supports HTTP range requests.
- `next.config.ts` applies `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` globally, so no response can currently be framed, even same-origin. This directly conflicts with embedding a PDF in an iframe.
- The project has no PDF rendering library on the client; `unpdf` is only used for server-side text extraction. The browser's native PDF viewer is therefore the rendering path.
- See `proposal.md` for motivation and the two spec deltas for required behavior.

## Goals / Non-Goals

**Goals:**

- Serve the original lesson PDF through the existing student session and share-link checks.
- Render it as the first tab and the initial tab without disturbing direct tab links or locale persistence.
- Full-screen reading with a graceful fallback for browsers that cannot full-screen embedded content.
- Keep the change reversible and free of database migrations.

**Non-Goals:**

- Converting, re-rendering, translating, or annotating the PDF.
- Page-level deep links, in-document search, or text extraction for students.
- Bundling a PDF.js viewer or adding a client PDF dependency.
- Changing how the admin views or downloads lesson files.
- Tracking PDF reading progress or analytics.

## Decisions

### 1. Dedicated student route: `GET /api/s/[token]/lessons/[lessonId]/source`

Reuse the established pattern from the video media route: `requireStudentContext(request, token)`, `assertLessonInShare(share, lessonId)`, load the lesson, then stream `lesson.storageKey` with `serveStoredMedia`. Return `404` both when the lesson record has no storage key and when the object is missing, so storage paths never leak. Content type is `application/pdf`; disposition is inline with a sanitized filename (ASCII fallback plus RFC 5987 `filename*` for Greek names) so the browser viewer and the download action both get a sensible name.

Alternative considered: a query parameter on the existing media route. Rejected — the existing route is keyed by video locale/kind and would conflate unrelated assets.

### 2. Extend `serveStoredMedia` with explicit response headers

Add an optional `headers` (or `contentDisposition`) option merged into both the 200 and 206 responses. This avoids duplicating range-handling logic in the route while keeping header composition in one place. Range support stays enabled so large PDFs load progressively.

### 3. Determine availability on the server, expose a URL only when readable

`loadLessonForStudent` gets a `sourceDocument: { url, filename } | null` field. Availability is `lesson.storageKey` is set and `getStorage().exists(...)` succeeds (guarded by try/catch). Doing the existence check server-side means the tab is hidden for fixtures/restores with missing files, and no broken tab or extra client probe is needed to decide whether the tab exists. The URL contains only the token, lesson id, and a fixed route segment.

Alternative considered: always show the tab and rely on the viewer's error state. Rejected because the tab bar would advertise content that does not exist; the viewer error state is still kept for failures after initial render.

### 4. Native iframe viewer plus a lightweight availability probe

Add a client component (e.g. `src/components/student/pdf-viewer.tsx`) that renders an `<iframe>` with a translated `title`. On mount and on each retry, it issues a ranged `GET` (`Range: bytes=0-0`) to the source route. `200`/`206` enables the frame; `401` shows a re-enter-name message linking to `/[locale]/s/[token]`; other failures show the generic unavailable message with a retry button. The probe keeps the tab honest when a file disappears or the session expires after the page loaded.

Alternative considered: blob-downloading the PDF into an object URL. Rejected — unnecessary memory cost for large files and defeats native progressive rendering.

### 5. Full screen via the Fullscreen API with an open-in-new-tab fallback

A "full screen" button calls `requestFullscreen()` on the viewer container (not the iframe) and exits on `fullscreenchange`; the container switches to a full-viewport layout while active. If `document.fullscreenEnabled` is false, the request rejects, or the API is absent (notably iOS Safari for non-video elements), the action opens the PDF in a new tab instead of failing silently. A separate "open in new tab" link is always present, and the viewer includes an inline help line for browsers that download PDFs instead of previewing them.

Alternative considered: `window.open` only. Rejected — desktop users asked for an in-place full-screen read, and the Fullscreen API works well there.

### 6. Tab order and default selection

Extend the `Tab` union with `"pdf"` and set the order to `["pdf", "cards", "video", "game", "quiz"]`. Because the existing default picks the first available tab, PDF becomes the initial tab automatically when `sourceDocument` is present. A `?tab=` value still wins, so existing deep links are preserved. Locale switches already keep the query string, so the PDF tab and document persist across Greek/English changes.

### 7. Relax framing headers to same-origin globally

Change the global `X-Frame-Options` to `SAMEORIGIN` and CSP `frame-ancestors` to `'self'`, leaving all other directives intact. Cross-origin framing and clickjacking protection are unchanged (both still reject external ancestors); only same-origin framing becomes possible, which the PDF iframe requires. This is preferred over route-specific header overrides because Next.js config headers can collide with handler-set headers and are hard to scope reliably to one API route.

Alternative considered: a more specific `headers()` rule for the PDF route combined with the generic rule. Rejected because duplicate header keys across matching rules have ambiguous precedence and could leave the PDF blocked or weaken unrelated routes.

## Risks / Trade-offs

- **Browser PDF handling differs**: Android Chrome and some mobile browsers may download the PDF instead of previewing it in an iframe; iOS Safari full screen is limited. → Always show an explicit "open in new tab" action and a short explanatory line; the full-screen control falls back to a new tab.
- **Global framing change**: `X-Frame-Options: SAMEORIGIN` allows the app to be framed by its own origin. → Still blocks all external framing, which is the actual clickjacking boundary; keep `frame-ancestors 'self'` aligned.
- **Session cookies and PDF viewers**: some embedded viewers handle cookies inconsistently. → The route relies on the same session cookie as the rest of the app; the ranged probe detects a 401 immediately and points the student back to name entry.
- **Extra filesystem stat per lesson load**: checking `storage.exists` adds one stat to the server render. → Single lightweight stat, cached nowhere; acceptable for a per-student page load.
- **Large PDFs**: teachers can upload large files; range support mitigates initial load, but some mobile viewers still fetch the whole file. → Keep inline streaming and avoid client-side buffering; no new limits in this change.
- **Filename headers**: Greek filenames need correct encoding. → Use an ASCII fallback plus `filename*=UTF-8''…` and strip quotes/control characters.

## Migration Plan

1. No database migration; `Lesson.storageKey` and `originalFilename` already exist.
2. Ship the route, server data field, component, translations, and tab wiring together.
3. Update the global framing headers in the same release; verify admin and student pages still load and the PDF renders after a production build.
4. Rollback: revert the code and header changes. No data cleanup is required; unused route/URLs simply disappear.

## Open Questions

None blocking. Whether to add page-level deep links or reading progress can be decided in a later change.
