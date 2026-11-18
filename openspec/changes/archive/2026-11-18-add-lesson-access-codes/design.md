# Design

## Context

See `proposal.md` for motivation and `specs/` for the behavior contract.

Current constraints that shape the approach:

- Students reach a lesson through `ShareLink` rows (`src/server/services/share-links.ts`). A link stores a recoverable `token` plus a SHA-256 `tokenHash`; resolution hashes the URL segment and loads the link. Lesson links are per-lesson, class links list ready lessons.
- Student sessions are JWTs in an httpOnly cookie and store `tokenHash` (`src/server/auth/student.ts`). Every student API route lives under `/api/s/[token]/...` and calls `requireStudentContext`, which re-resolves the identifier and requires the session hash to match.
- The student landing (`src/app/[locale]/s/[token]/page.tsx`) and lesson page (`.../lesson/[lessonId]/page.tsx`) already accept an arbitrary `token` path segment, so a numeric identifier can reuse those routes.
- Lesson records are created in `src/server/services/ingestion.ts` inside a per-file loop, already wrapped in a cleanup-on-failure block.
- Redis-backed throttling already exists for teacher login (`src/server/auth/rate-limit.ts`) with env-configured limits, and API routes use `withAdmin`/`withPublic` plus same-origin mutation checks.
- The public home page (`src/app/[locale]/page.tsx`) is a server component with no student entry today.

## Goals / Non-Goals

**Goals:**

- Add the access number without changing share-link tokens, expiry, revocation, or class-link behavior.
- Make assignment safe under concurrency and make backfill deterministic to deploy.
- Reuse the existing student landing, session, guard, tabs, and API routes rather than adding a parallel student stack.
- Keep number lookup cheap (one indexed query) and bounded by a shared throttle.
- Keep the teacher control small and consistent with existing admin client components.

**Non-Goals:**

- Replacing share links or changing their lifecycle.
- Class-level or multi-lesson access numbers.
- Putting the access number on public lesson screens, exports, or class lists.
- Per-cookie or per-account throttling; there are no student accounts.
- Making the number secret-grade cryptography or hashing it at rest.

## Decisions

### 1. Store the number as a unique `Lesson.accessCode` text column

Add `accessCode String @unique` to `Lesson`. It stores exactly 9 digits (`100000000`–`999999999`) as text, so leading-zero-free numbers sort and display predictably and future formats are not locked to an integer width.

**Why plaintext:** the teacher must be able to read and re-share the number at any time, and regeneration replaces it. Hashing would require a separate display-once flow that conflicts with the requirement to show it on the lesson page.

**Why not a separate `LessonAccessCode` table:** the number is one-to-one with the lesson and shares its lifecycle. A nullable column on `Lesson` keeps reads, cascades, and the backfill simple. Uniqueness is a database constraint, not application coordination.

**Alternative considered:** deriving the number from the lesson ID or a counter. Rejected because it leaks creation order and makes adjacent lessons guessable; the clarification chose random numbers.

### 2. Assignment uses `randomInt` with a bounded collision retry

Add `src/server/services/lesson-access-codes.ts`:

- `newLessonAccessCode()` → `String(randomInt(100_000_000, 1_000_000_000))`
- `assignAccessCode(db)` → generate, check `lesson.findUnique({ where: { accessCode } })`, and retry up to 10 times on a taken value; return the chosen code.
- `regenerateAccessCode(lessonId, db)` → assign a new code and `lesson.update`, retrying on the unique constraint (`P2002`) if a concurrent writer wins the race.

Lesson creation passes `accessCode` in the existing `db.lesson.create` call. Collision handling is two-layered: a pre-check for the common case and a `P2002` retry around create/update for concurrency. Ten attempts against a 900-million space is effectively guaranteed and bounds worst-case latency; each retry is one indexed lookup.

**Why not a database sequence:** a sequence produces guessable neighbors. **Why not a UUID-derived number:** it still needs collision handling and obscures the simple format. Keeping generation in one service means ingestion and regeneration share the same rule.

### 3. Backfill in a hand-edited migration

Run `prisma migrate dev --create-only` and edit the SQL:

1. `ALTER TABLE "Lesson" ADD COLUMN "accessCode" TEXT;`
2. `CREATE UNIQUE INDEX "Lesson_accessCode_key" ON "Lesson"("accessCode");` — created while the column is still nullable so the constraint exists during the backfill, and multiple `NULL`s remain allowed.
3. A `DO $$ ... $$` block that loops over lessons with `accessCode IS NULL`, picks a random 9-digit value with `floor(random() * 900000000 + 100000000)::int::text`, and retries when the unique index rejects a collision.
4. `ALTER TABLE "Lesson" ALTER COLUMN "accessCode" SET NOT NULL;`

The migration is ordered nullable → unique index → backfill → not-null so it succeeds on a populated database. Prisma's schema is updated to match, and `prisma migrate diff` should report no drift afterward.

**Why in SQL rather than a seed script:** every environment (including production) must receive numbers in the same deploy that starts requiring them; a post-deploy script leaves a window where new code cannot insert lessons.

### 4. Numeric identifiers resolve through the existing student access path

Add `src/server/services/student-access.ts` (or extend `share-links.ts`) with:

- `isLessonAccessCode(value)` → `^[1-9]\d{8}$`
- `resolveStudentAccess(identifier)`: if the value is a 9-digit code, load the owning lesson (with its class and ready state) and return a normalized access object with `lessonId`, `classId`, `lesson`, and a class-lesson list containing that lesson. Otherwise resolve the real share link as today, preserving revocation and expiry errors.

The synthetic code-access object intentionally mirrors the fields the student code already reads (`lessonId`, `lesson`, `classId`, `class.lessons`). The existing landing page, lesson page, guard, `assertLessonInShare`, and all `/api/s/[token]/...` routes continue to work with the code string in the `token` segment; only resolution changes. `resolveShareToken` remains the token-only helper for admin/share-link code paths.

Session binding stays `tokenHash: hashShareToken(identifier)`. A code session therefore applies only to that numeric identifier, matching the existing rule that a session is scoped to one share link. Returning students opening the same number are recognized; opening a different number asks for name and school again.

**Why not create a hidden `ShareLink` per lesson:** it would surface in teacher link lists, inherit expiry/revocation semantics the number must not have, and add a second source of truth. A synthetic resolution result is smaller and keeps `ShareLink` meaning "teacher-created student link."

### 5. One throttle for every number lookup

Extend `src/server/auth/rate-limit.ts` with code-lookup functions backed by Redis:

- `assertCodeLookupAllowed(ip)`: reject with `RateLimitError` when a lock key exists, reporting its TTL.
- `recordCodeFailure(ip)`: increment `lesson-code:fail:<ip>` (30-second TTL, reset to 1 when the counter is new); when the count reaches `LESSON_CODE_MAX_FAILURES` (5), set `lesson-code:lock:<ip>` with a 30-second TTL.
- `clearCodeFailures(ip)`: delete both keys after a successful lookup.

Add `LESSON_CODE_MAX_FAILURES` (default 5) and `LESSON_CODE_LOCKOUT_SECONDS` (default 30) to `src/lib/env.ts`, matching the login-limit style.

Both entry points use it: the home-screen form posts to a public lookup endpoint that checks the throttle before resolving, and numeric URL page loads call the same check/record pair before rendering. A valid code clears the counters. Rejected requests during lockout do not extend the lock.

**Trade-off:** IP-based limiting can briefly block a whole school NAT after repeated mistyping. The 30-second window, per-success reset, and clear message keep this acceptable; a per-cookie counter alone would be trivially bypassed. The limit is a deterrent, not a security boundary; the random space plus regeneration cover the residual guessing risk.

### 6. Home-screen entry posts to a small public lookup endpoint

Add `POST /api/s/code` (`withPublic`) accepting `{ code: string }`:

1. Validate the 9-digit shape (reject empty/non-numeric before lookup).
2. Check the throttle.
3. Resolve the code.
4. On success clear failures and return `{ lessonId }`; the client navigates to `/{locale}/s/{code}`.
5. On miss record a failure and return `404` with code `code_not_found`; during lockout return `429` with `code_rate_limited` and `retryAfter` seconds.

Add a client `AccessCodeEntry` component to the home page: a labeled numeric input (`inputMode="numeric"`, `maxLength=9`, non-digits stripped, `autoComplete="off"`), a submit button, an inline error/`role="alert"` message, and a visible countdown while locked out. After the countdown the form enables again without a reload. The component navigates with the localized router.

**Why an endpoint instead of a server action:** it matches the existing route-handler pattern, gives the client explicit status/retry data, and lets direct numeric URLs share the exact throttle helpers without duplicating page-level state. The numeric URL remains the canonical, shareable form.

### 7. Teacher display and regeneration

Add `POST /api/admin/lessons/[lessonId]/access-code` using `withAdmin(..., { mutation: true })`. The route regenerates the lesson's code and returns `{ accessCode }` on success; there is no separate read endpoint because the admin page is server-rendered. The admin lesson detail page renders a small `LessonAccessCode` client component next to the title:

- the number in a monospace, `tracking-widest` block labeled with an admin message key
- a round `Button size="icon" variant="ghost"` with a `RefreshCw` icon and an explicit `aria-label`
- `window.confirm` warning that the previous number stops working, then the POST, state update, and `router.refresh()`
- inline success/error feedback

Only the lesson detail page shows the number; the admin lesson list stays unchanged to avoid visual noise.

### 8. Localization and accessibility

Add matching keys to `messages/el.json` and `messages/en.json`: home number-entry labels/placeholders/errors/lockout text, admin code label/refresh/confirmation/success/failure, and student invalid-number text. The input is labeled, the error is announced, the refresh control is icon-only but named, and both locales use the same number formatting (plain 9 digits).

## Risks / Trade-offs

- **A 9-digit space is enumerable in principle** → random assignment, 5-failure/30-second throttle, successful lookups clear counters, and the teacher can regenerate. Residual online guessing is bounded; the number is a convenience credential, comparable to a share link that is intentionally handed out.
- **NAT/school-wide lockout** → 30-second window, success reset, explicit countdown message. If this proves noisy, the lockout duration can be tuned by env without a schema change.
- **Synthetic code access could drift from share-link fields** → keep the normalized access type in one module and cover it with integration tests for lesson scoping, class-link separation, and session mismatch.
- **Regeneration invalidates an active student session** → the numeric identifier in the session no longer resolves; the student sees the invalid-number message and can re-enter the new number. This matches "old number stops working."
- **Backfill migration on a large lesson table** → the loop only touches rows with `accessCode IS NULL` and uses an indexed lookup; run it in the same deploy before enforcing `NOT NULL`. Rollback is dropping the column and index.
- **Extra Redis dependency on the public lookup path** → reuse the existing Redis client and the login-limit failure mode; treat Redis errors as lookup failures rather than exposing content.

## Migration Plan

1. Update `prisma/schema.prisma` with `accessCode String @unique`, generate a create-only migration, and hand-edit it to add, backfill, constrain, and uniquely index the column in that order.
2. Deploy the migration with the app; the migration backfills every existing lesson before the new code path is used.
3. New lessons get a code in `ingestion.ts`; existing numeric URLs and links keep working because share-link resolution is untouched.
4. Rollback: drop the unique index and `Lesson.accessCode`; the numeric entry UI and endpoint should be reverted in the same release, while share links need no data changes.
