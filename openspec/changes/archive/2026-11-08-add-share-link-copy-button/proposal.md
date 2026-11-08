# Proposal

## Why

The admin lesson and class pages list existing student share links, but a teacher can only copy the URL of a link at the moment it is created. Once the page is reloaded, the raw token is gone because only its SHA-256 hash is persisted, so the teacher cannot re-share an existing link and is forced to create a duplicate.

## What Changes

- Persist the share token alongside its hash when a link is created, so the link URL can be reconstructed later.
- Include the token when serializing share links on the class and lesson admin pages and in the admin share-links list API.
- Add a copy-link button to each existing share link in the student share links list.
- Keep copy unavailable for links created before this change (no stored token) and for revoked or expired links.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `student-experience`: share link generation now retains a retrievable token so an existing link can be copied from the admin list; revoked and expired links remain uncopyable.

## Impact

- Prisma schema and migration: add a nullable token column to `ShareLink`; existing rows remain null.
- `src/server/services/share-links.ts`: store the token on create and expose it through list results.
- `src/app/api/admin/share-links/route.ts` and the class/lesson admin pages: carry the token to the client.
- `src/components/admin/share-link-manager.tsx`: per-link copy control.
- `messages/en.json` and `messages/el.json`: any new copy/legacy labels.
- Tests: share-link service and admin UI/list serialization coverage.
