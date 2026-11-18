# Add lesson resource links and YouTube videos

- Change: `add-lesson-resources`
- Created: `2026-11-18`
- Status: implemented
- Implemented: 2026-11-18

## Request

To have the ability to add links useful to the students and youtube videos. Both links and youtube videos should also be present when the student views the lesson

## Clarifications

- Resources are managed per lesson by the teacher, and are also suggested automatically from the PDF.
- Automatic suggestions cover URLs found in the PDF text layer, link annotations, and QR codes decoded from images embedded in PDF pages.
- Automatically extracted resources enter a teacher review queue; only approved resources are visible to students.
- Students see a Resources tab positioned after Cards and before Game.
- YouTube videos play in an embedded player.
- Each resource has a single title and description shared by the Greek and English interfaces.

## Implementation

- Completed: 2026-11-18
- Tasks: 24/24
- Verification: `npm run typecheck`; `npm run lint`; `npm test` (162 passed); `npm run test:integration` (138 passed); `npm run test:e2e` (14 passed)
