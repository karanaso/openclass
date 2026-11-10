# Proposal

## Why

The codebase has accumulated helper functions, exported types, and local variables that no longer have any references. Several were superseded by newer implementations (for example `ensurePageImages` by direct `renderPdfPageImages` calls and `negotiateLocale` by the next-intl middleware). Dead code increases maintenance cost, misleads readers about what is still in use, and dilutes the signal from type-checking and linting. Removing it now keeps the module surface small before further feature work lands.

## What Changes

- Remove 13 unreferenced exported functions/values:
  - `CardFooter` (`src/components/ui/card.tsx`)
  - `publicConfig` (`src/lib/env.ts`)
  - `childLogger` (`src/lib/logger.ts`)
  - `jsonError` (`src/server/auth/guard.ts`)
  - `setTeacherSession`, `clearTeacherSession` (`src/server/auth/session.ts`)
  - `createMockProvider` (`src/server/generation/mock-provider.ts`)
  - `findCompletedAttempt` (`src/server/repositories/attempts.ts`)
  - `beginLessonStage`, `getLessonOrThrow` (`src/server/repositories/lesson-status.ts`)
  - `getSessionNameForDisplay`, `clearStudentCookie` (`src/server/student/guard.ts`)
  - `ensurePageImages` (`src/worker/processors/tts.ts`)
- Remove 6 exported types that are never consumed: `LessonSummary`, `CardUpdateInput`, `CardCreateInput`, `ClassInput`, `QuestionCreateInput`, `MediaKind`.
- Remove 6 unused locals/imports: `lessonT`, the `Locale` type import, the `NextResponse` import, the unused `request` parameter on `DELETE`, the leftover `byId` map in questionnaire grading, and an unused `url` in the security test.
- Remove imports that become unused as a result (e.g. `NextResponse`, `cookies`, `renderPdfPageImages`).
- **Prevent recurrence**: enable `noUnusedLocals` and `noUnusedParameters` in `tsconfig.json` so the compiler rejects new unused locals and imports.
- No runtime behavior, API, database, or external-interface changes.

### Out of scope

- Test lifecycle helpers (`resetEnvCache`, `resetStorage`, `closeRedis`, `closeLessonQueue`) that exist for test setup/teardown.
- Code that is unreferenced in production but exercised by tests (`getLessonUsage`, `getClassUsage`, `negotiateLocale`, `GET /api/admin/session`, and the un-consumed results GET routes). These may be intentional public or planned surfaces and are kept.
- Over-exported symbols that are still used inside their own module (e.g. `isAppError`, `isLocale`, `buttonVariants`, zod schemas). Only unnecessary `export` keywords are not part of this change.

## Capabilities

### New Capabilities

None. This is a pure refactor/tooling change with no spec-level behavior change, so the change sets `skip_specs: true`.

### Modified Capabilities

None.

## Impact

- **Code**: `src/components/ui/card.tsx`, `src/lib/env.ts`, `src/lib/logger.ts`, `src/server/auth/guard.ts`, `src/server/auth/session.ts`, `src/server/generation/mock-provider.ts`, `src/server/repositories/attempts.ts`, `src/server/repositories/lesson-status.ts`, `src/server/student/guard.ts`, `src/server/student/questionnaire.ts`, `src/server/services/cards.ts`, `src/server/services/classes.ts`, `src/server/services/questions.ts`, `src/server/media/serve-media.ts`, `src/types/admin.ts`, `src/worker/processors/tts.ts`, two admin result/class pages, two API routes, and `tests/security.integration.test.ts`.
- **Build**: `tsconfig.json` gains `noUnusedLocals` and `noUnusedParameters`.
- **Dependencies / APIs / data**: none.
- **Verification**: `tsc --noEmit`, `npm test`, and `npm run lint` must pass.
