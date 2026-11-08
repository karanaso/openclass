# Design

## Context

See `proposal.md` for motivation and `specs/student-experience/spec.md` for the required behavior.

Today `ShareLink` persists only `tokenHash` (SHA-256). The raw token is returned once from `POST /api/admin/share-links` and then lost. Admin list data reaches the client through two paths:

- Server components `admin/classes/[classId]` and `admin/lessons/[lessonId]`, which pass `classroom.shareLinks` / `lesson.shareLinks` into `ShareLinkManager`.
- `GET /api/admin/share-links`, which returns `listShareLinks()` rows unchanged.

Student resolution (`resolveShareToken`) looks up by `tokenHash`, and `AUTH_SECRET` already exists for signing sessions. The project uses Prisma with SQLite/Postgres migrations under `prisma/migrations`.

## Goals / Non-Goals

**Goals:**

- Let a teacher copy the URL of any still-valid link from the existing share-link list, including after a page reload.
- Preserve the current student URL format (`/<locale>/s/<token>`) and hash-based resolution, expiry, and revocation.
- Fail safely for links created before token retention.

**Non-Goals:**

- Recovering or rotating tokens for pre-existing links.
- Changing token entropy, lifetime, or the `tokenHash` lookup.
- Adding a share-link management page beyond the current embedded list.

## Decisions

### Persist the raw token in a nullable column

Add `token String?` to `ShareLink` and set it in `createShareLink` alongside `tokenHash`. The column is nullable because historical rows cannot be backfilled.

- Why: it is the smallest change that makes existing URLs recoverable, and only authenticated admins ever receive the value.
- Alternatives rejected:
  - Encrypting the token with a key derived from `AUTH_SECRET` would reduce exposure from a database dump, but adds key/version handling and still requires a schema change. It can be layered on later without changing the API shape.
  - Deterministically deriving the token from a server secret and the link id would avoid storing a secret, but changes token generation and needs a stable id before creation, which is a larger refactor.
  - Regenerating a token on copy would silently invalidate URLs already given to students.

### Return the token only through admin-scoped paths

`LinkInfo` in `share-link-manager.tsx` gains `token: string | null`; both admin pages map it from Prisma rows and the admin API returns rows that now include it. `withAdmin` continues to guard the API. Student-facing loaders keep using raw request tokens and never read the stored column.

### Build URLs in one shared helper

Extract the URL construction currently inlined in the create flow into a small client-safe helper (for example `shareUrl({ origin, locale, token })`) and reuse it for create and per-row copy, so class and lesson views cannot drift.

### Copy control per row

Each non-revoked, non-expired row with a token gets a copy button that writes the URL to the clipboard and briefly shows the copied state, keyed by link id. Rows without a token show a short "link unavailable" label instead of the button. Revoked and expired rows keep their existing status treatment and get no working copy action.

## Risks / Trade-offs

- **Plaintext bearer tokens at rest** → Only admin-authorized code paths select them; a future encryption change is additive. Document that database access is equivalent to link access.
- **Legacy links cannot be copied** → Show an explicit unavailable label and leave the create flow intact; no silent failure.
- **Clipboard API requires a secure context** → The existing create-link copy already depends on it; no new constraint is introduced.
- **Token leaks through logs or serialization** → Never log the column, and keep it out of student-facing responses and error payloads.

## Migration Plan

1. Add the nullable column via a Prisma migration; existing rows stay `null`.
2. Deploy the schema before the application code that reads the column.
3. Rollback: revert the application; dropping the column does not affect hash-based resolution for already-copied links.

## Open Questions

None. Recovering legacy links is explicitly out of scope; teachers can create a replacement link.
