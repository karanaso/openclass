# Design

## Context

See `proposal.md` for motivation and `specs/` for the behavior contract.

Current constraints that shape the approach:

- PDF processing already has an extraction stage (`src/worker/processors/extract.ts`) that loads the stored PDF, extracts page text with `unpdf`, persists `LessonPage` rows, and then queues generation. `unpdf` also exposes `extractImages`, `extractLinks`, and document/page access, so resource discovery can reuse the existing parser without adding a rendering/native canvas dependency.
- Lesson content is loaded server-side for students by `loadLessonForStudent` (`src/server/student/lesson-data.ts`), which already enforces the share-link and student-session checks upstream. Resources can ride along with that payload rather than adding a new public endpoint.
- The student lesson shell is a client component (`src/components/student/lesson-tabs.tsx`) with a fixed `Tab` union, availability map, and `?tab=` deep-link handling.
- Teacher mutations follow the existing pattern: server-rendered admin page plus small client components calling `withAdmin` route handlers with same-origin mutation checks (`src/server/http.ts`, `src/server/auth/guard.ts`).
- The app CSP is defined in `next.config.ts`; it currently has no `frame-src`, so an embedded YouTube player would be blocked by `default-src 'self'`.
- There is no QR decoder or image-processing dependency in the project. `jsqr` is pure JavaScript and accepts raw RGBA pixels, which matches the image objects returned by `unpdf`.

## Goals / Non-Goals

**Goals:**

- Persist resource data with clear review states, stable ordering, and reliable deduplication.
- Reuse the existing extraction stage and PDF parser; discovery must never turn a healthy lesson into a failed one.
- Keep the teacher workflow in the existing lesson detail page and the student workflow inside the existing tab shell.
- Make URL handling safe: only HTTP/HTTPS, no server-side fetching, safe link attributes, and a narrowly scoped CSP allowance.
- Keep the implementation testable at the URL utility, extraction, service, route, student-loader, component, and end-to-end levels.

**Non-Goals:**

- Fetching page titles, thumbnails, or metadata from remote URLs.
- Supporting image-only/scanned PDFs for text generation; QR discovery does not change the existing "no selectable text" failure.
- Detecting QR codes drawn as vector graphics inside the PDF content stream.
- Reading resources from external documents, class-level resource libraries, or cross-lesson reuse.
- Reordering resources by drag-and-drop; order is creation order.
- Restoring dismissed suggestions from the UI. Dismissed rows are retained for deduplication but hidden from the default list.

## Decisions

### 1. Data model: one `LessonResource` table with enums and a URL fingerprint

Add `LessonResource` with:

- `id`, `lessonId`, `kind` (`LINK` | `YOUTUBE`), `status` (`SUGGESTED` | `APPROVED` | `DISMISSED`)
- `source` (`MANUAL` | `TEXT` | `ANNOTATION` | `QR`), `sourcePage` nullable
- `title`, `description` nullable, `url`, `youtubeId` nullable
- `fingerprint`, `position`, `createdAt`, `updatedAt`
- unique `(lessonId, fingerprint)`, index `(lessonId, position)`, cascade delete with the lesson

`fingerprint` is a SHA-256 of the canonical URL (or `youtube:<videoId>`), so the unique constraint enforces deduplication even for concurrently inserted suggestions. Manual creation sets `status = APPROVED`; discovery sets `SUGGESTED`.

**Why:** one table keeps list ordering, counts, and status transitions simple. A separate suggestion table would duplicate validation and make approval a data migration. Storing the fingerprint avoids putting long URLs in a unique index and gives YouTube forms a shared identity.

**Alternative considered:** storing resources as JSON on `Lesson`. Rejected because per-resource approval, deduplication, and indexed queries would become awkward.

### 2. URL parsing and normalization live in a pure shared module

Create `src/lib/resources.ts` (no Node-only imports) exposing:

- `parseResourceUrl(value)` → `{ url, kind, youtubeId, fingerprintInput }` or a validation error
- `youtubeVideoId(url)` and `youtubeEmbedUrl(videoId)`
- `resourceTitleFromUrl(url, kind)`
- `isSupportedResourceUrl(value)`

Rules:

- Trim input, reject empty/control characters and anything over 2000 characters.
- Require `http:` or `https:`; reject credentials, `javascript:`, `data:`, `mailto:`, and other schemes.
- Canonicalize scheme/host casing, remove default ports, drop fragments, remove trailing slash on non-root paths, drop common tracking parameters (`utm_*`, `fbclid`, `gclid`), and sort remaining query parameters for the fingerprint input. The stored `url` uses the same canonical form so student links are stable.
- YouTube hosts: `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, and `youtu.be`. Accept `/watch?v=`, `/shorts/<id>`, `/embed/<id>`, `/live/<id>`, and `youtu.be/<id>` when the identifier matches `^[A-Za-z0-9_-]{11}$`. Everything else on a YouTube host remains a `LINK` (for example a channel or playlist page), which satisfies the "no embeddable video" scenario.
- For `YOUTUBE`, store `youtubeId`; build the embed URL with `https://www.youtube-nocookie.com/embed/<id>`.

Server-side fingerprinting uses `createHash("sha256")` in the resource service, keeping crypto out of the client bundle.

**Why:** a single parser used by writes, reads, extraction, and tests prevents drift between validation and rendering. A conservative YouTube whitelist avoids embedding arbitrary YouTube pages.

### 3. Extraction runs after page persistence and is wrapped as best-effort

Add `src/server/pdf/resources.ts` with `discoverResourceCandidates(bytes, pages)`:

1. **Text URLs**: scan each stored page's text with an HTTP(S) URL pattern (also accept `www.` and prepend `https://`), trim trailing punctuation, keep the first occurrence per normalized URL, and attach `sourcePage`. When the same line contains non-URL text of 1–200 characters, use a trimmed version as the title; otherwise derive the title from the URL.
2. **Link annotations**: load the document once with `getDocumentProxy(bytes)`, call `page.getAnnotations()` per page, and collect `Subtype === "Link"` annotations with an HTTP(S) `url`. `unpdf`'s `extractLinks` is not used because it flattens pages and loses the source page.
3. **QR codes**: for each page, call `extractImages(pdf, pageNumber)` (from `unpdf`). For each image within the safety caps, expand 1- and 3-channel pixel arrays to RGBA and call `jsQR(data, width, height)`. If the decoded payload is an HTTP(S) URL, record it with `source: "QR"` and the page number.

Safety caps:

- `MAX_RESOURCES_PER_LESSON = 50`
- `MAX_QR_IMAGES_PER_PAGE = 8`
- skip images wider or taller than 4096 px and images over 16 million pixels
- ignore undecodable images, malformed payloads, and non-HTTP(S) targets

The discovery call is wrapped in `try/catch` and logs a warning; a failure never changes lesson status. Candidates are inserted with `createMany({ skipDuplicates: true })` so retries and regeneration are idempotent and existing manual/approved/dismissed rows keep their status.

Insertion happens after `LessonPage` rows are committed and before `setLessonStatus(..., "GENERATING")`, so generation is not delayed by a failure path.

**Why:** discovery is opportunistic data enrichment, not a required artifact. Keeping it after page storage means the text scan uses the same normalized text that generation uses, and the unique constraint handles concurrency and retries.

**Alternative considered:** rendering every page to a bitmap and decoding the whole page. That catches vector-drawn QR codes but requires a native canvas dependency and adds significant CPU/memory cost. The chosen approach covers QR images, which is the common case when a teacher embeds a QR in a worksheet.

### 4. Teacher API is a small service plus two route files

Add `src/server/services/resources.ts`:

- `listLessonResources(lessonId)` → all non-dismissed resources ordered by `position`, `createdAt` (suggestions first-class for review), plus a dismissed count if useful to the page.
- `createManualResource(lessonId, input)` → validate fields, parse URL, reject duplicates with `409 ConflictError`, assign `position = max + 1`, `status = APPROVED`, `source = MANUAL`.
- `updateResource(lessonId, resourceId, input)` → allow `title`, `description`, `url`, and optional `status`; revalidate URL and recompute `kind`/`youtubeId`/`fingerprint`; enforce `SUGGESTED → APPROVED|DISMISSED` only for status changes.
- `deleteResource(lessonId, resourceId)` → only for `APPROVED` or `MANUAL` rows; delete the row.
- `createSuggestedResources(lessonId, candidates)` → normalize, dedupe by fingerprint, `createMany` with `skipDuplicates`.

Routes:

- `POST /api/admin/lessons/[lessonId]/resources`
- `PATCH /api/admin/lessons/[lessonId]/resources/[resourceId]`
- `DELETE /api/admin/lessons/[lessonId]/resources/[resourceId]`

All use `withAdmin(..., { mutation: true })`. The admin page loads the list server-side, so no admin `GET` route is required; client components update local state and call `router.refresh()`.

Validation schema (zod): title 1–200 trimmed, description ≤500, URL ≤2000. Manual duplicates return `409` with a stable `duplicate_resource` code. Invalid input uses the existing `422` handling.

**Why:** matching `cards.ts` keeps the codebase consistent. Recomputing the fingerprint on URL edits prevents two resources from converging on the same destination.

### 5. Student payload contains only approved resources

Extend `loadLessonForStudent` to include:

```ts
resources: {
  where: { status: "APPROVED" },
  orderBy: [{ position: "asc" }, { createdAt: "asc" }],
}
```

Map to `StudentResource = { id, kind, title, description, url, youtubeId, sourcePage }`. No status, source, or fingerprint is exposed. There is no new public endpoint; the existing share-token and student-session checks remain the only access path.

**Why:** fewer moving parts and no way to request another lesson's resources by ID.

### 6. Student UI: new `resources` tab between Cards and Game, with click-to-play video

- Extend `Tab` to `"pdf" | "cards" | "resources" | "game" | "quiz"`, with `resources` available when `data.resources.length > 0` and ordered `pdf, cards, resources, game, quiz`.
- Add a `LessonResources` client component (`src/components/student/lesson-resources.tsx`):
  - one card per resource with title, optional description, and a kind badge
  - `LINK`: an anchor with `target="_blank"` and `rel="noopener noreferrer"`, plus a visible host label and external-link icon
  - `YOUTUBE`: a poster/play button until clicked, then a responsive 16:9 iframe with `src={youtubeEmbedUrl(id)}`, `loading="lazy"`, `allowFullScreen`, and an accessible `title`; a separate "Watch on YouTube" link is always available
  - no autoplay; clicking a different video replaces the active player
- Reuse the existing `?tab=resources` deep-link behavior; unavailable deep links fall back to the first available tab through the current effect.

**Why click-to-play:** it avoids contacting YouTube on page load, keeps the tab fast on classroom Wi-Fi, and gives a graceful fallback if the iframe is blocked. The direct link satisfies the "player unavailable" scenario.

### 7. Teacher UI: a resource manager section on the lesson page

Add `src/components/admin/resource-manager.tsx` and render it after `GeneratedContentEditors`, before the share-link card:

- Add form: URL, title, optional description. The kind is detected from the URL and shown as a hint; the teacher can submit a YouTube or general link with the same form.
- List groups approved/manual resources and suggestions, ordered by the server.
- Suggestions show a "Suggested" badge, discovery source badge (text/annotation/QR), and source page, with **Approve** and **Dismiss** actions.
- Approved/manual rows support inline edit (title, description, URL) and delete with confirmation.
- Status feedback uses the existing small-alert/status pattern; `router.refresh()` updates counts and server state after each mutation.

Add `_count.resources` to `getLessonDetail` so the artifacts card can show the total alongside cards, questions, attempts, and deck views.

**Why:** keeping management on the existing lesson page avoids a new admin route and matches how cards and questions are edited.

### 8. CSP, dependencies, and localization

- Add `"jsqr"` to `dependencies`. It is pure JavaScript and works in the Node worker.
- Add `frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com;` to the CSP. `www.youtube.com` is included because the privacy-enhanced player may navigate its own frame to YouTube for consent/error flows. No `img-src` change is needed because thumbnails are not fetched.
- Add matching keys under `admin` and `student` in `messages/el.json` and `messages/en.json`; the existing parity test enforces identical key sets.
- Resource titles/descriptions are stored and rendered as plain text; React escaping handles them. UI labels around them are localized.

### 9. Migration

Add one Prisma migration that creates the three enums and `LessonResource`, the unique index, the ordering index, and the foreign key with `ON DELETE CASCADE`. No backfill is needed. Generate it with `prisma migrate dev` (or hand-write the equivalent SQL in the repo's existing style).

Rollback/downgrade: revert the app/worker image, keep the unused table if a roll-forward is expected; otherwise drop the table and enums after removing the feature. Resource data is additive and does not affect existing lesson rows.

## Risks / Trade-offs

- **Vector QR codes are missed** → Accept the limitation; text URLs and link annotations still work, and the teacher can add the resource manually. Document it in the extraction module.
- **False-positive URLs from prose** → Require a valid HTTP(S) URL, trim trailing punctuation, dedupe, and keep suggestions behind teacher review.
- **Large or malicious images consume worker memory** → Cap image count per page, image dimensions, total pixels, and candidates per lesson; catch per-image errors and continue.
- **Extraction slows the worker** → Only inspect embedded images (not full-page renders), cap the work per page, and keep discovery after the required page write so failures cannot block generation.
- **Unique constraint collisions across discovery and manual entry** → Use `skipDuplicates` for discovery and return `409` for manual duplicates; re-check fingerprints when a URL is edited.
- **YouTube embed blocked by CSP or privacy settings** → Allow the required frame origins, use `youtube-nocookie.com`, lazy-load only on play, and always show a direct link.
- **Dismissed suggestions are hidden permanently** → Intentional for this change to keep the review queue clean and prevent re-suggestion; the row remains for deduplication.

## Migration Plan

1. Add `jsqr` and run `npm install`; update the lockfile.
2. Add the Prisma models/enums and generate the migration.
3. Deploy the migration before rolling out web and worker images. The new table is additive, so the old code keeps working during the rollout.
4. Deploy worker first (it writes suggestions), then web (it reads and manages them). Both tolerate an empty resource table.
5. Verify with a lesson that contains a printed URL and a QR image, then with a manual link and YouTube video.
6. If rollback is required, revert the deployment first; drop the table/enums only when the feature will not be restored.

## Open Questions

None that affect the specs or task breakdown. The exact wording of the derived title for URL-only suggestions can be tuned during implementation without changing behavior.
