# Tasks

## 1. Remove unreferenced exports from shared, logging, and auth modules

- [x] 1.1 Remove `CardFooter` from `src/components/ui/card.tsx`; verify no reference remains with `grep -rn "\bCardFooter\b" src tests e2e`.
- [x] 1.2 Remove `publicConfig` from `src/lib/env.ts`; verify no reference remains with `grep -rn "\bpublicConfig\b" src tests e2e`.
- [x] 1.3 Remove `childLogger` from `src/lib/logger.ts`; verify no reference remains with `grep -rn "\bchildLogger\b" src tests e2e`.
- [x] 1.4 Remove `jsonError` and the now-unused `NextResponse` import from `src/server/auth/guard.ts`; verify no reference remains and `npm run typecheck` still passes.
- [x] 1.5 Remove `setTeacherSession` and `clearTeacherSession` from `src/server/auth/session.ts`; verify no reference remains and `npm run typecheck` still passes.

## 2. Remove unreferenced exports from generation, repositories, and worker modules

- [x] 2.1 Remove `createMockProvider` from `src/server/generation/mock-provider.ts`; verify no reference remains with `grep -rn "\bcreateMockProvider\b" src tests e2e`.
- [x] 2.2 Remove `findCompletedAttempt` from `src/server/repositories/attempts.ts`; verify no reference remains with `grep -rn "\bfindCompletedAttempt\b" src tests e2e`.
- [x] 2.3 Remove `beginLessonStage` and `getLessonOrThrow` from `src/server/repositories/lesson-status.ts`; verify no reference remains and `npm run typecheck` still passes.
- [x] 2.4 Remove `ensurePageImages` and the now-unused `renderPdfPageImages` import from `src/worker/processors/tts.ts`; verify no reference remains with `grep -rn "\bensurePageImages\b" src tests e2e`.

## 3. Remove unreferenced student helpers and unused types

- [x] 3.1 Remove `getSessionNameForDisplay`, `clearStudentCookie`, and the now-unused `cookies` import from `src/server/student/guard.ts`; verify no reference remains and `npm run typecheck` still passes.
- [x] 3.2 Remove unused types `LessonSummary`, `CardUpdateInput`, `CardCreateInput`, `ClassInput`, `QuestionCreateInput`, and `MediaKind` from their respective files; verify no reference remains with `grep -rn "\bLessonSummary\b\|\bCardUpdateInput\b\|\bCardCreateInput\b\|\bClassInput\b\|\bQuestionCreateInput\b\|\bMediaKind\b" src tests e2e`.

## 4. Remove unused locals and imports

- [x] 4.1 Remove `lessonT` from `src/app/[locale]/admin/classes/[classId]/page.tsx`; verify `tsc` no longer reports TS6133 for that file.
- [x] 4.2 Remove the unused `Locale` type import from `src/app/[locale]/admin/classes/[classId]/results/page.tsx`; verify `tsc` no longer reports TS6133 for that file.
- [x] 4.3 Remove the unused `NextResponse` import from `src/app/api/admin/share-links/route.ts`; verify `tsc` no longer reports TS6133 for that file.
- [x] 4.4 Remove the unused `request` parameter from `DELETE` in `src/app/api/s/[token]/session/route.ts`; verify the route still exports a valid `DELETE` handler and `tsc` no longer reports TS6133.
- [x] 4.5 Remove the leftover `byId` map from `src/server/student/questionnaire.ts`; verify questionnaire unit tests still pass with `npx vitest run tests/questionnaire.test.tsx`.
- [x] 4.6 Remove the unused `url` local from `tests/security.integration.test.ts`; verify `tsc` no longer reports TS6133 for that file.

## 5. Enable compiler guard against new dead locals

- [x] 5.1 Add `"noUnusedLocals": true` and `"noUnusedParameters": true` to `tsconfig.json`; verify `npm run typecheck` exits 0.
- [x] 5.2 Confirm the guard actually fires by temporarily introducing an unused local in a scratch TypeScript file and running `npx tsc --noEmit`, then delete the scratch file; verify the compiler reports TS6133 before cleanup.

## 6. Integration verification

- [x] 6.1 Run `npm run typecheck`; verify it exits 0 with no TS6133 diagnostics.
- [x] 6.2 Run `npm test`; verify all unit tests pass with no failures.
- [x] 6.3 Run `npm run lint`; verify it exits 0 and introduces no new warnings beyond the pre-existing `react-hooks/exhaustive-deps` warning in `src/components/student/lesson-tabs.tsx`.
- [x] 6.4 Review `git diff` to confirm only deletions, unused imports, and the two `tsconfig.json` flags changed, with no runtime logic edits.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived change and that `openspec list` no longer reports `clean-up-dead-code` as active.
