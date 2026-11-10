# Design

## Context

See `proposal.md` — Why for motivation. The current state that shapes the approach:

- The project is a Next.js App Router app with TypeScript, Prisma, Vitest, and Playwright.
- `tsconfig.json` currently does **not** enable `noUnusedLocals` or `noUnusedParameters`, so dead locals/imports are only caught incidentally.
- Many modules export symbols that are consumed only by tests or only within their own file. Those are intentionally retained, so a simple "unused export" grep is not sufficient to decide what to delete.
- Routes under `src/app/api/**/route.ts` are framework entrypoints and may be called by API clients, not just the UI.

## Goals / Non-Goals

**Goals:**

- Remove only symbols with zero references outside their own definition.
- Leave test infrastructure, public route handlers, and intra-module exports untouched.
- Make the result durable by enabling compiler flags that reject new unused locals/imports.
- Keep the change free of runtime behavior changes.

**Non-Goals:**

- Removing test-only helpers or production-unused-but-tested utilities.
- Changing module boundaries, renaming exports, or restructuring services.
- Introducing a third-party dead-code tool (knip, ts-prune) or a new CI job.
- Adding or changing spec-covered behavior.

## Decisions

### 1. Classify by reference scope, not by export presence alone

Use three evidence sources:

1. Whole-repo symbol search (including `src`, `tests`, `e2e`, `prisma`, `scripts`, and untracked files) for each exported name.
2. `tsc --noEmit --noUnusedLocals --noUnusedParameters` for locals, parameters, and imports.
3. A review of framework conventions (`generateStaticParams`, `generateMetadata`, `middleware.config`) that are referenced by the framework rather than by application code.

Only symbols with a single occurrence (their own declaration) are deleted. Symbols referenced by tests are treated as used. This avoids deleting intentional test seams.

*Alternative considered:* use `knip` or `ts-prune`. Rejected because neither is installed, both add a dependency/tooling surface, and hand-verification is sufficient for a one-time cleanup of this size.

### 2. Delete whole declarations and their now-unused imports together

When removing a function that was the only consumer of an import, remove the import in the same edit. Examples: `NextResponse` in `guard.ts`, `cookies` in `student/guard.ts`, `renderPdfPageImages` in `worker/processors/tts.ts`. This keeps `noUnusedLocals` clean immediately after the change.

*Alternative considered:* leave imports and let a follow-up remove them. Rejected because it leaves the tree temporarily failing the new compiler flags.

### 3. Keep test-only and over-exported code

`getLessonUsage`, `getClassUsage`, `negotiateLocale`, `resetEnvCache`, `resetStorage`, `closeRedis`, `closeLessonQueue`, and the un-consumed API route handlers remain. They either support tests, are plausible public surfaces, or are used internally and merely over-exported. Removing them would expand scope beyond "dead code" into API policy, which belongs in a separate change.

### 4. Enforce prevention with TypeScript flags

Add `"noUnusedLocals": true` and `"noUnusedParameters": true` to `tsconfig.json`. TypeScript then fails `npm run typecheck` when new unused locals, parameters, or imports are introduced. This is lower-cost than a lint rule and works in editors and CI without extra dependencies.

*Alternative considered:* enable `@typescript-eslint/no-unused-vars` as an error. Rejected because the project uses `next/core-web-vitals` and does not otherwise depend on the typescript-eslint config; the compiler flags deliver the same guarantee with no new tooling.

### 5. Unused parameter convention

For the unused `request` parameter on `DELETE` in `src/app/api/s/[token]/session/route.ts`, drop the parameter entirely. Route handlers are allowed to omit it. If a future need for the request arises, it can be re-added; removing it is cleaner than keeping a permanently unused parameter or adding an underscore that the compiler flags do not need.

## Risks / Trade-offs

- **Hiding a dynamic/framework reference** → Mitigation: review Next.js conventions explicitly; keep all `route.ts`, `page.tsx`, and `layout.tsx` exports. The deleted symbols are ordinary helpers, not framework entrypoints.
- **Deleting something planned for near-term use** → Mitigation: scope excludes test-only and route-level surfaces; over-exported symbols are retained. Anything needed again is recoverable from git history.
- **Compiler flags break future incremental work** → Trade-off accepted: unused locals/parameters must be removed or intentionally consumed. This is the desired guardrail and matches the project's strict TypeScript posture.
- **Edits span many modules** → Mitigation: the changes are mechanical deletions with no logic changes; run `tsc`, unit tests, and lint after the pass. Integration/e2e suites are unchanged and can be run separately.
- **Untracked in-flight files** → Mitigation: reference scans include untracked files so newly added features are not broken by a deletion.

## Migration Plan

1. Apply deletions module by module.
2. Remove imports that become unused.
3. Add the two compiler flags.
4. Run `npm run typecheck`, `npm test`, and `npm run lint`.
5. Roll back by reverting the commit if any verification fails; no data or schema migration is involved.
