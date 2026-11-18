# Tasks

## 1. Data model and topic primitives

- [x] 1.1 Add `topics Json?` and `topicsEdited Boolean @default(false)` to `Lesson`, and `AI` to `ResourceSource` in `prisma/schema.prisma`; create the migration with `npx prisma migrate dev --name add_lesson_topics_and_ai_resources`. Verify with `npx prisma validate`, `npx prisma generate`, and by reading the migration SQL to confirm the column defaults and enum change.
- [x] 1.2 Create `src/lib/topics.ts` with `MAX_TOPICS_PER_LOCALE = 8`, `TOPIC_MAX = 40`, a `LessonTopics` type, and normalization/parsing helpers that trim, drop empty values, cap length, deduplicate case-insensitively per locale, and treat `null` as empty. Verify with `tests/topics.test.ts` covering valid, duplicate, empty, oversized, and `null` input, run via `npm test -- topics`.
- [x] 1.3 Update the resource source unions and view types in `src/server/services/resources.ts` so `AI` is accepted alongside `MANUAL`, `TEXT`, `ANNOTATION`, and `QR`, and ensure the Prisma `ResourceSource` type matches. Verify with `npm run typecheck`.

## 2. Provider, prompts, and generation pipeline

- [x] 2.1 Add a permissive topic response schema and a bounded resource-suggestion response schema (title, optional description, URL; at most 12 items) plus their TypeScript types in `src/server/generation/schemas.ts`. Verify with schema tests in `tests/generation.test.ts` for valid, malformed, and over-limit payloads.
- [x] 2.2 Extend `ContentProvider` with `topics(input)` and `suggestResources(input)`, add prompt builders for both, add an even-sampling helper that keeps topic prompts within `DEFAULT_MAX_CHARS` across all pages, and bump `PROMPT_VERSION` because the generation prompt set changes. Verify with prompt tests asserting bilingual instructions, lesson-content grounding, topic inclusion in suggestion prompts, no student data, and budget compliance.
- [x] 2.3 Implement deterministic `topics` and `suggestResources` methods in `MockContentProvider` using lesson text for topics and valid, parseable example/YouTube URLs for suggestions. Verify with tests asserting repeatable output, valid URL shapes, and that the mock provider satisfies the same interface as OpenAI.
- [x] 2.4 Implement `topics` and `suggestResources` in `OpenAIContentProvider` with strict JSON schema names and the new prompt builders. Verify with tests that stub `fetch` and assert the request uses the expected schema name and the parsed result is returned for both methods.
- [x] 2.5 Extend the generation result and `publishArtifacts` so generated topics are written in the same publication transaction as cards and questions. Verify with `tests/generation.test.ts` that a successful generation stores topics and that a failed publication leaves previous topics and artifacts unchanged.
- [x] 2.6 Wire the topic call into `generateLessonContent` as best-effort: call it once per attempt, log and continue on provider or validation failure, and skip the call when `topicsEdited` is true. Verify with tests that a topic provider failure still publishes cards/questions and reaches `READY`, and that edited topics survive regeneration while unedited topics are replaced.
- [x] 2.7 Update `docs/generation.md` for the v3 prompt/version, topic generation, and AI resource suggestions, including the best-effort and review-only behavior. Verify the documented pipeline, provider contract, and version match the implemented code.

## 3. Teacher topic editing

- [x] 3.1 Create `src/server/services/topics.ts` with a Zod update schema and `getLessonTopics` / `updateLessonTopics`, where updates replace both lists and set `topicsEdited: true`. Verify with an integration test that saves, normalizes, clears, and rejects invalid lists.
- [x] 3.2 Add `PATCH /api/admin/lessons/[lessonId]/topics` using `withAdmin(..., { mutation: true })` and return the saved topics. Verify with integration tests for authenticated save, unauthenticated denial, cross-origin rejection, and validation errors that leave stored topics unchanged.
- [x] 3.3 Build a `LessonTopicsEditor` client component with Greek and English chips, add/remove controls, save status, an empty state, and validation feedback. Verify with `tests/lesson-topics-editor.test.tsx` covering add, remove, clear, save success, and save failure.
- [x] 3.4 Render the topics editor on `src/app/[locale]/admin/lessons/[lessonId]/page.tsx` using the lesson's stored topics, positioned with the lesson editing controls. Verify by rendering the page in a component test or by `npm run typecheck` plus local manual load of a lesson with and without topics.
- [x] 3.5 Add all new teacher topic labels and validation messages to `messages/el.json` and `messages/en.json`. Verify with `tests/messages.test.ts` and by switching the interface language while the editor is open.

## 4. AI resource proposals backend

- [x] 4.1 Extend `createSuggestedResources` to accept `AI` as a source and return the newly created resource views along with the count. Verify with `tests/resources.integration.test.ts` that existing extraction callers still work and AI-source rows are returned.
- [x] 4.2 Implement `suggestLessonResources` so it loads lesson text, title, and topics; requires at least one usable input; asks the provider for at most 8 proposals; validates each proposal independently; truncates descriptions; normalizes URLs and derives kind/YouTube id; and writes valid results as `SUGGESTED`/`AI` without fetching any URL. Verify with unit tests for valid, mixed-valid, duplicate, capped, no-content, provider-failure, and no-outbound-fetch cases.
- [x] 4.3 Add `POST /api/admin/lessons/[lessonId]/resource-suggestions` with teacher authentication and same-origin mutation protection, returning the created suggestions and a `resource_limit_reached` conflict when the lesson cap is full. Verify with integration tests for success, unauthenticated, cross-origin, provider failure, and cap-reached responses.
- [x] 4.4 Add a regression test proving student lesson data still omits topics and only returns approved resources. Verify with the existing student integration test suite and a targeted assertion in `tests/student.integration.test.ts`.

## 5. Teacher resource UI

- [x] 5.1 Add the "Suggest games & videos" button and progress/error/empty states to `ResourceManager`, merge returned suggestions into local state, and render AI proposals with an AI source badge and unverified hint. Verify with `tests/resource-manager.test.tsx` covering click, loading block, success merge, no-suggestion message, limit error, and the AI badge.
- [x] 5.2 Add the suggestion action and AI-source labels to `messages/el.json` and `messages/en.json`. Verify with `tests/messages.test.ts` and by checking both locale renders of the resource manager.
- [x] 5.3 Add an end-to-end test `e2e/lesson-topics-and-ai-resources.spec.ts` covering: teacher edits topics, requests suggestions, approves an AI proposal, and confirms the student Resources tab shows only the approved resource while topics stay absent. Verify with `npx playwright test e2e/lesson-topics-and-ai-resources.spec.ts` using the mock provider.
- [x] 5.4 Update the README feature list to mention bilingual lesson topics and AI-proposed game/video resources with teacher review. Verify the rendered README section lists both features without contradicting the review-only behavior.

## 6. Integration verification

- [x] 6.1 Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:integration`; resolve any failures introduced by the new schema, provider methods, services, or UI.
- [x] 6.2 Run `npm run test:e2e`; confirm the existing lesson resource and student flows still pass alongside the new topics/suggestions spec.
- [x] 6.3 Start the app against a clean database, apply migrations with `npx prisma migrate deploy`, and verify a lesson can generate topics, save edits, create AI suggestions, approve one, and expose it to a student.

## Workflow follow-up

- Archive the change and sync the accepted `lesson-topics` and `lesson-resources` deltas after review and verification.
