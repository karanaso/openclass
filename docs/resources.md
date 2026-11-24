# Lesson resources

Lesson resources are extra links and YouTube videos that belong to one lesson. Teachers curate them from the lesson admin page, and students reach them from the **Resources** tab in the student lesson view.

## Teacher workflow

1. Open a lesson from **Admin → class → lesson**.
2. Use **Lesson resources** to add a title, URL, and optional description.
   - A supported YouTube video URL (watch, short, shorts, embed, or live form) is detected automatically and played in an embedded player.
   - Any other HTTP or HTTPS URL is stored as a normal link.
3. When the PDF contains URLs, link annotations, or QR codes, extraction adds them under **Suggestions**. Open a suggestion's link or choose **Visit** to inspect its destination in a new tab with `noopener noreferrer`, then choose **Approve** to publish it or **Dismiss** to hide it permanently.
4. Approved resources can be edited inline or deleted. Manual resources are published immediately.

Only approved resources are sent to students. Suggested and dismissed resources never appear in the student payload.

## Automatic discovery

Resource discovery runs during the PDF extraction stage, after page text is stored and before content generation is queued. It scans:

- HTTP(S) and `www.` URLs in the extracted page text
- URI link annotations on each page
- QR codes in raster images embedded in the PDF

Safety limits:

- at most 50 resources per lesson
- at most 8 QR images inspected per page
- images larger than 4096 px in either dimension or above 16 megapixels are skipped
- undecodable images and non-HTTP(S) QR payloads are ignored
- discovery failures are logged and never fail the lesson

Discovery never fetches a URL. Teachers may need to add links manually when a QR code is drawn as vector artwork rather than embedded as an image.

## Student presentation

The student lesson tab order is PDF, Cards, Resources, Game, Questionnaire. The Resources tab is only offered when at least one approved resource exists, and `?tab=resources` deep links work like the other tabs.

- Normal links open in a new tab with `noopener noreferrer`.
- YouTube videos use a click-to-play `https://www.youtube-nocookie.com` embed; a direct YouTube link is always shown as a fallback.
- Resource titles and descriptions are shared by both interface languages; the surrounding labels follow the selected locale.

## CSP

The application CSP must allow YouTube frames. `next.config.ts` includes:

```
frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com;
```

Both origins are allowed because the privacy-enhanced player may navigate its own frame to YouTube for consent or error flows.

## Verification

```bash
npm test -- tests/resources.test.ts tests/resource-extraction.test.ts
npm test -- tests/lesson-tabs.test.tsx tests/lesson-resources.test.tsx tests/resource-manager.test.tsx
npm run test:integration -- tests/resources.integration.test.ts tests/student.integration.test.ts
npm run typecheck
npm run lint
```
