# Design

## Context

See `proposal.md` for motivation and `specs/class-management/spec.md` for the behavior contract.

`Lesson.title` already exists (`prisma/schema.prisma`), is populated at upload from the PDF filename (`titleFromFilename` in `src/server/services/ingestion.ts`), and is the single source for the admin lesson list, the admin lesson detail header, and the student lesson header above the Game tab (`loadLessonForStudent`). There is no title editing path today. Admin mutations follow a consistent pattern: a route under `src/app/api/admin/...` wrapped in `withAdmin(..., { mutation: true })`, with zod validation and persistence in `src/server/services/...`. Admin pages are `force-dynamic`, so a saved title is visible on the next load.

## Goals / Non-Goals

**Goals:**

- Let the teacher rename an existing lesson with one small inline form, without re-uploading or regenerating anything.
- Reuse the existing title column and display path so every lesson view, including the student Game tab header, shows the edit consistently.
- Match existing admin API, validation, authorization, and i18n conventions.

**Non-Goals:**

- Separate game-specific titles, localized titles, or per-mode titles. The user chose one lesson title shared by both locales.
- Editing the original PDF filename, storage key, or generated artifacts.
- Audit history, revision tracking, or optimistic concurrency control.
- Enabling title edits from the class lesson list; the lesson detail page is the editing surface.

## Decisions

### Reuse `Lesson.title` rather than adding a game title field

The title the user wants to edit is the lesson title already rendered above the Game tab. Adding a second column would create two competing names and force a fallback rule. One column keeps the admin list, detail page, student header, results exports, and usage views consistent with no migration.

**Alternative considered:** a `gameTitle` column. Rejected as duplicative for the selected behavior.

### `PATCH /api/admin/lessons/[lessonId]` with `{ title }`

The lesson route already owns lesson GET/DELETE, and `PATCH` matches the partial-update convention used by the class and card routes. The handler calls `updateLessonTitle(lessonId, await request.json())` through `withAdmin(..., { mutation: true })`, preserving teacher authentication and same-origin protection. A dedicated `/title` subroute was considered and rejected as unnecessary for one field.

### Validate in the service with zod

Add a `lessonTitleSchema = z.string().trim().min(1).max(200)` and parse it inside `updateLessonTitle`. The 200-character limit matches `titleFromFilename`, and trimming before persistence prevents titles that are visually blank. `ZodError` is already mapped to a 422 `validation_error` response by `toErrorResponse`, so the route stays thin. Client-side `required`/`maxLength` is a UX nicety, not the enforcement point.

### Service returns the updated lesson

`updateLessonTitle` looks up the lesson first and throws `NotFoundError` when missing, then updates `title` and returns the record. Looking up first yields a precise 404 instead of relying on Prisma error codes or silently upserting a lesson. The response `{ lesson }` lets the client confirm the persisted value.

### Inline editor on the admin lesson detail header

Add a small client component (`LessonTitleEditor`) that receives `lessonId` and `initialTitle`, renders the current title with a pencil button, switches to an input with Save/Cancel, disables controls while pending, and shows a localized error on failure. On success it updates local state and calls `router.refresh()`; on cancel it restores the original value. This keeps the change local to the page header and avoids a new modal or route. The class lesson list stays read-only and picks up the new title on its next load.

### No changes to student rendering

`loadLessonForStudent` and `LessonTabs` already read `lesson.title` from the database and the student lesson page is `force-dynamic`. Once the title is updated, the next student load (including the Game tab header) shows it. No cache invalidation or client changes are needed.

### i18n keys in the `admin` namespace

Add labels and messages to `messages/en.json` and `messages/el.json`: edit title action, save, cancel (reuse `common.cancel`), success, failure, and required-title text. No new student strings are needed because the title itself is user data.

## Risks / Trade-offs

- **Concurrent edits from two browser tabs** → last write wins; acceptable for a single-teacher admin and no data loss beyond the older title. A revision field would add complexity without a current need.
- **Editing while a lesson is processing** → safe because generation does not read or overwrite `Lesson.title`; the new title persists through generation. The design deliberately allows editing in any status.
- **Students with an already-open page** → they keep the old title until the next load; no live push is required by the spec.
- **Title inconsistency in exports or reports** → exports read the current lesson title, so they follow the edit automatically; this is desirable, not a regression.
- **No audit trail** → a rename is not recorded. Acceptable for a metadata correction; can be added later without changing the spec.

## Migration Plan

1. Deploy the code change; no database migration or backfill is required because the column exists.
2. Verify an existing lesson can be renamed and that the new title appears on the admin detail page and student lesson header.
3. Rollback by reverting the code: stored title edits remain valid data and the previous UI simply stops offering the editor.
