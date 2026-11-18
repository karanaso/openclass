# Tasks

## 1. Dependency and data model

- [x] 1.1 Add `jsqr` to `dependencies`, update `package-lock.json`, and verify `npm ls jsqr` resolves a single installed version.
- [x] 1.2 Add `ResourceKind`, `ResourceStatus`, and `ResourceSource` enums plus the `LessonResource` model, its `Lesson` relation, unique `(lessonId, fingerprint)`, and `(lessonId, position)` index to `prisma/schema.prisma`.
- [x] 1.3 Generate the Prisma migration for the new table/enums; verify `npx prisma validate` and `npx prisma migrate deploy` succeed against the test database.

## 2. Shared resource URL utilities

- [x] 2.1 Implement `src/lib/resources.ts` with URL validation, canonicalization, tracking-parameter removal, `www.` handling, YouTube video-ID extraction for `watch`, `youtu.be`, `shorts`, `embed`, and `live`, embed URL construction, and URL-derived title fallback.
- [x] 2.2 Add `tests/resources.test.ts` covering accepted/rejected schemes, credentials, length limits, fragment/trailing-slash normalization, tracking parameters, all supported YouTube forms, non-video YouTube pages falling back to `LINK`, and readable title fallback; verify with `npm test -- tests/resources.test.ts`.

## 3. Resource service and admin API

- [x] 3.1 Implement `src/server/services/resources.ts` with zod field limits, SHA-256 fingerprints, `listLessonResources`, `createManualResource` (approved + `position = max + 1`), `updateResource` (revalidate URL, recompute kind/YouTube ID/fingerprint, enforce `SUGGESTED → APPROVED|DISMISSED`), `deleteResource` for approved/manual rows, and idempotent `createSuggestedResources` using `skipDuplicates`.
- [x] 3.2 Add `POST /api/admin/lessons/[lessonId]/resources` and `PATCH`/`DELETE /api/admin/lessons/[lessonId]/resources/[resourceId]` using `withAdmin(..., { mutation: true })`.
- [x] 3.3 Add `tests/resources.integration.test.ts` covering manual create/edit/delete, duplicate `409`, invalid URL/title/description, approve/dismiss transitions, dismissed URLs not duplicated, auth rejection, and cross-origin rejection; verify with `npm run test:integration -- tests/resources.integration.test.ts`.

## 4. PDF resource discovery

- [x] 4.1 Implement `src/server/pdf/resources.ts` to scan page text for HTTP(S)/`www.` URLs, read per-page Link annotations through `getDocumentProxy`, decode raster page images through `unpdf` `extractImages` + `jsQR`, expand 1/3-channel pixels to RGBA, and apply the caps for candidates, images per page, and image dimensions/pixels.
- [x] 4.2 Add a small QR PNG fixture to `tests/fixtures/` and add `tests/resource-extraction.test.ts` covering text URLs, duplicate URLs across pages, embedded QR images, invalid/non-HTTP QR payloads, image caps, and readable titles; verify with `npm test -- tests/resource-extraction.test.ts`.
- [x] 4.3 Integrate discovery into `src/worker/processors/extract.ts` after page persistence and before `GENERATING`, wrapped so any discovery error is logged and never fails the lesson; add a test that discovery failure still leaves the lesson on its normal generation path.
- [x] 4.4 Verify extraction idempotence by running `createSuggestedResources` twice for the same candidates and asserting one row and preserved statuses; add this assertion to the resource or extraction test suite.

## 5. Student data and Resources tab

- [x] 5.1 Extend `loadLessonForStudent` with an `APPROVED`-only resource query, stable ordering, and a `StudentResource` type that excludes status/source/fingerprint; add a `tests/student.integration.test.ts` assertion that suggested and dismissed resources are omitted.
- [x] 5.2 Build `src/components/student/lesson-resources.tsx` with approved-resource cards, external links using `target="_blank"` and `rel="noopener noreferrer"`, click-to-play privacy-enhanced YouTube iframes with accessible titles, a direct YouTube link, and a responsive 16:9 layout.
- [x] 5.3 Extend `src/components/student/lesson-tabs.tsx` with the `resources` tab after Cards and before Game, availability based on `data.resources.length > 0`, the link icon, and rendering of the new component.
- [x] 5.4 Add `tests/lesson-resources.test.tsx` and update `tests/lesson-tabs.test.tsx` to verify tab order, resources hidden when empty, link attributes, play-button-to-iframe behavior, and `?tab=resources` deep-link selection; verify with `npm test -- tests/lesson-tabs.test.tsx tests/lesson-resources.test.tsx`.

## 6. Teacher resource manager and localization

- [x] 6.1 Build `src/components/admin/resource-manager.tsx` with the add form, detected-kind hint, approved/manual edit and delete controls, suggestion Approve/Dismiss controls, discovery-source badges, status feedback, and `router.refresh()` after mutations.
- [x] 6.2 Wire the manager into `src/app/[locale]/admin/lessons/[lessonId]/page.tsx`, load resources alongside cards/questions, and add `resources` to `getLessonDetail`'s `_count` so the artifacts card reports the total.
- [x] 6.3 Add matching `admin` and `student` message keys to `messages/el.json` and `messages/en.json`, including `student.tabs.resources`, resource form labels, validation messages, suggestion source labels, and player/link actions.
- [x] 6.4 Add `tests/resource-manager.test.tsx` covering add/edit/delete/approve/dismiss interactions and error rendering, and verify the existing `tests/messages.test.ts` parity check still passes.
- [x] 6.5 Document the teacher workflow, extraction sources/limits, and CSP requirement in `docs/resources.md`; verify the documented commands and URLs match the implementation.

## 7. Configuration and integration verification

- [x] 7.1 Add `frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com;` to the CSP in `next.config.ts` and verify the served response header includes both frame origins.
- [x] 7.2 Add `e2e/lesson-resources.spec.ts` for a teacher creating a link and a YouTube resource, approving a suggested resource, and a student seeing the Resources tab after Cards, opening a link, and swapping a video into the embedded player.
- [x] 7.3 Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, and `npm run test:e2e`; resolve failures and confirm all suites pass.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied and the implementation is merged.
- Verify the archived specs contain the new `lesson-resources`, `resource-extraction`, and `resource-presentation` capabilities and the updated `student-experience` lesson-tabs requirement.
