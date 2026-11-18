# Proposal

## Why

Teachers often point students to extra material — a useful article, a reference site, or a YouTube video — outside the lesson, and lesson PDFs frequently already contain those URLs and QR codes. Students currently have no way to reach that material from the lesson flow, so useful links are lost or retyped. Bringing teacher-approved links and videos into the lesson, with automatic discovery from the source PDF as a starting point, keeps everything in one place without extra manual work.

## What Changes

- Add per-lesson resources that can be either a general link or a YouTube video, each with a single title, an optional description, a URL, and an optional source page.
- Let the teacher add, edit, approve, dismiss, and delete resources from the lesson admin page. Manually created resources are published immediately; automatically discovered ones wait in a review queue.
- During PDF extraction, discover candidate resources from URLs printed in the text layer, URI link annotations, and QR codes decoded from images embedded in the PDF. Record candidates as suggestions, deduplicate them per lesson, and keep discovery failures from failing the lesson.
- Add a Resources tab to the student lesson view, positioned after Cards and before Game and shown only when the lesson has at least one approved resource. YouTube resources play in an embedded privacy-enhanced player; other links open in a new tab.
- Validate resource URLs (HTTP/HTTPS only), enforce length limits, and expose only approved resources to students through the existing share-link access checks.
- Add the `frame-src` allowance required for the YouTube embed and localize the new teacher and student interface strings in Greek and English.

## Capabilities

### New Capabilities

- `lesson-resources`: Teacher-facing lifecycle of lesson links and videos, including manual creation, editing, deletion, review and approval of discovered suggestions, validation, deduplication, and which resources are visible to students.
- `resource-extraction`: Best-effort automatic discovery of resource candidates from an uploaded PDF — text URLs, link annotations, and QR codes in embedded images — run as part of lesson processing without blocking generation.
- `resource-presentation`: Student-facing Resources tab that lists approved links and plays YouTube videos in an embedded player, with accessible and responsive behavior.

### Modified Capabilities

- `student-experience`: The lesson tab set now includes a Resources tab after Cards and before Game, offered only when approved resources exist, while keeping existing deep-link and fallback behavior.

## Impact

- **Data**: New `LessonResource` table, `ResourceKind` and `ResourceStatus` enums, a lesson relation, and a unique `(lessonId, fingerprint)` constraint; a Prisma migration is required.
- **Processing**: The extract worker gains resource discovery after page text extraction; discovery is best-effort and must not change lesson success or failure semantics. `jsqr` is added as a dependency; no canvas or native image dependency is needed.
- **Server**: New resource service and admin API routes for list/create/update/approve/dismiss/delete; `loadLessonForStudent` returns approved resources only; lesson detail includes resource counts.
- **Student UI**: `LessonTabs` gains the `resources` tab and a new resources component; the existing `?tab=` deep link behavior applies.
- **Teacher UI**: New resource manager section on the lesson detail page for manual entry and suggestion review.
- **Localization**: New `admin` and `student` message keys in both `messages/el.json` and `messages/en.json`.
- **Security/Config**: CSP gains `frame-src` for `https://www.youtube-nocookie.com`; URLs are validated and never fetched server-side.
- **Tests**: Unit tests for URL normalization/YouTube detection, service and route integration tests, extraction tests with URL/QR fixtures, student loading tests, tab/component tests, message parity, and an end-to-end teacher-to-student flow.
