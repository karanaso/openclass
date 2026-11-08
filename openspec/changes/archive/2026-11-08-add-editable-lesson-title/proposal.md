# Proposal

## Why

Lesson titles are derived from uploaded PDF filenames and cannot be changed, so the title shown above the student Game tab (and everywhere else the lesson appears) often exposes an awkward filename. Teachers need to correct or humanize that title without re-uploading the PDF.

## What Changes

- Add a teacher-only API endpoint to rename an existing lesson.
- Validate the new title as non-empty, trimmed text of at most 200 characters, matching the existing title creation limit.
- Add an inline rename control to the admin lesson detail page with save/cancel and error feedback.
- Show the updated title in the admin lesson views and in the student lesson header, including above the Game tab.
- Keep the original PDF filename unchanged and leave generated cards, questions, videos, and results untouched.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `class-management`: Add a requirement that the teacher can edit a lesson's title and that the updated title is reflected in admin and student views.

## Impact

- `src/app/api/admin/lessons/[lessonId]/route.ts` — add a `PATCH` handler.
- `src/server/services/classes.ts` — add title validation and an `updateLessonTitle` service.
- `src/app/[locale]/admin/lessons/[lessonId]/page.tsx` plus a small client component — inline title editing.
- `messages/en.json`, `messages/el.json` — admin labels and error text.
- `tests/classes.integration.test.ts` — cover validation, authorization, not-found, and persistence.
- No database migration: `Lesson.title` already exists.
