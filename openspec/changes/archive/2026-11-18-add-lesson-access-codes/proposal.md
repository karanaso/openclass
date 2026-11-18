# Proposal

## Why

Students currently need a long, unguessable share URL to reach a lesson, which is awkward to dictate in class or write on a board. A short 9-digit number per lesson gives every lesson a simple, link-like entry point, while keeping the existing share links and their revocation/expiry behavior intact. Older lessons need numbers too, so the shortcut works for the whole existing library.

## What Changes

- Add a unique 9-digit access number (`100000000`–`999999999`) to every lesson. New lessons receive one automatically at upload; existing lessons are backfilled by the migration.
- Show the number on the lesson admin page with a round refresh button that regenerates it. Regenerating immediately invalidates the previous number for that lesson.
- Let students enter the 9-digit number on the public home screen and be redirected to the lesson, and let the number itself work directly in the student URL, e.g. `/el/s/123456789`.
- Resolve a 9-digit number to the same student flow as a lesson share link: the name/school entry screen, then the PDF, Cards, Resources, Game, and Questionnaire tabs, with all existing access checks and per-lesson scoping.
- Rate-limit number lookups: after 5 unsuccessful attempts the client is locked out for 30 seconds, with a clear message and the remaining time.
- Keep the existing class and lesson share links working exactly as before. The number is an additional shortcut, not a replacement.

## Capabilities

### New Capabilities

- `lesson-access-codes`: Lifecycle and lookup of a lesson's 9-digit access number — automatic assignment, global uniqueness, backfill for existing lessons, teacher visibility, regeneration, direct resolution, and failed-lookup throttling.

### Modified Capabilities

- `student-experience`: Students can reach a lesson by entering a 9-digit number on the home screen or through a numeric student URL, using the existing name/school entry, lesson tabs, and session behavior.

## Impact

- **Data**: New unique `Lesson.accessCode` column; a Prisma migration adds it, backfills every existing lesson with a unique random 9-digit value, then enforces `NOT NULL` and uniqueness.
- **Server**: New access-code utility (`src/lib/` or `src/server/services/`) for generation, lookup, and resolution; lesson creation in `src/server/services/ingestion.ts` assigns a code with collision retry; the student guard, share-resolution path, and student session route accept a numeric code as well as a share token; new admin API route to regenerate a code.
- **Teacher UI**: Code display and round refresh control on the admin lesson detail page; confirmation that regenerating invalidates the old number.
- **Student UI**: Number entry form on the public home page; numeric URL support on the existing student landing route; localized invalid/rate-limited messaging.
- **Rate limiting**: Redis-backed failure counter and 30-second lockout keyed by client IP, following the existing login rate-limit pattern; new limits in `src/lib/env.ts`.
- **Localization**: New `home`, `admin`, and `student`/`errors` message keys in both `messages/el.json` and `messages/en.json`.
- **Tests**: Unit tests for code generation/validation, integration tests for backfill/lookup/regeneration/throttling, component tests for the home form and refresh control, session-route tests, message parity, and an end-to-end student flow using the number.
