# Design

## Context

See `proposal.md` for motivation. The current system extracts PDF text in the worker, derives card/question artifacts through the provider pipeline, and discovers resource URLs during extraction. Resources are stored in `LessonResource` with `SUGGESTED`/`APPROVED`/`DISMISSED` review states and `MANUAL`/`TEXT`/`ANNOTATION`/`QR` sources. Teachers curate them in `resource-manager.tsx`; AI calls go through the `ContentProvider` interface, which has a real OpenAI Responses implementation and a deterministic mock.

Constraints that shape the approach:

- Generation is chunked and retried; a single malformed AI response can fail and retry the whole attempt.
- The admin API uses `withAdmin` plus same-origin checks for mutations.
- Student lesson data is loaded separately and currently contains no topic fields.
- There is no live web-search integration, and the request explicitly chose AI-proposed links over a search API.

## Goals / Non-Goals

**Goals:**

- Produce a small, bilingual, source-grounded topic list per lesson without making lesson generation less reliable.
- Let teachers edit topics and keep their edits across regeneration.
- Reuse the existing provider abstraction, resource review queue, deduplication, and per-lesson cap.
- Keep AI-proposed links unverified and teacher-approved only.

**Non-Goals:**

- Live web search, result scraping, link previews, or network validation of proposals.
- Showing topics to students or using them as student-facing navigation.
- Changing QR, annotation, or text URL discovery.
- Auto-approving AI proposals or adding a second content-review workflow.
- Recording per-request token cost for on-demand suggestion calls as a generation job.

## Decisions

### 1. Store topics as bounded JSON on `Lesson`

Add `topics Json?` with the shape `{ el: string[], en: string[] }` and `topicsEdited Boolean @default(false)`, instead of a `LessonTopic` table. Topic lists are small (at most 8 per locale), always replaced as a whole by the editor, and never queried individually, so a table would add joins and per-tag CRUD without a benefit. A dedicated `lib/topics.ts` owns normalization and limits, and both the generation path and the admin route validate through it.

Alternative considered: a `LessonTopic` row per keyword, mirroring `CardTranslation`. Rejected because keywords have no per-row identity, ordering is trivial, and replacement semantics fit a bounded JSON value.

### 2. Generate topics once per lesson, best-effort, before cards

Add `topics(input)` to `ContentProvider` and call it once per generation attempt after pages are loaded and before the chunk loop. The prompt receives an evenly sampled excerpt of up to `DEFAULT_MAX_CHARS` across all pages, so a long PDF is represented end-to-end instead of only its first pages. The call is wrapped separately: provider errors, timeouts, and malformed responses are logged and produce no topics, and generation proceeds to cards/questions.

Topics are published inside the existing `publishArtifacts` transaction. If the rest of generation fails, no topics are saved, keeping lesson publication atomic. When `topicsEdited` is true, the provider call is skipped and the stored lists are left untouched.

Alternative considered: generating topics per chunk and merging. Rejected because it multiplies calls and produces noisy tag sets; the lesson-level gist is better derived once from a sampled excerpt.

### 3. Use a dedicated `lesson-topics` service and admin route

`src/server/services/topics.ts` exposes a read/update path with Zod validation and normalization: trim, drop empty values, cap at 40 characters, deduplicate case-insensitively per locale, and cap at 8 per locale. Updates replace both lists and set `topicsEdited: true`. A `PATCH /api/admin/lessons/[lessonId]/topics` route uses `withAdmin(..., { mutation: true })`, matching the other admin mutations.

The lesson admin page already loads the full lesson through `getLessonDetail`, so topics are passed directly to a new `LessonTopicsEditor` client component. The editor keeps local tag state, supports add/remove for Greek and English, and persists through the route. An empty list is valid and shows an empty state.

### 4. Model AI proposals as normal suggested resources with source `AI`

Add `AI` to `ResourceSource` and reuse `createSuggestedResources` for persistence. A new service, `suggestLessonResources`, loads the lesson, its pages, and topics; requires at least one of title, text, or topics; builds a suggestion prompt; and passes the valid proposals to `createSuggestedResources` with `source: "AI"`.

`createSuggestedResources` gains `AI` in its source union and returns the newly created views in addition to the count. Existing callers in the extraction processor ignore the extra field. It continues to enforce the 50-resource per-lesson cap, normalized URL fingerprints, and `skipDuplicates`, so AI proposals cannot bypass review or duplication rules.

Alternative considered: writing a separate AI-resource table. Rejected because approval, dismissal, deduplication, student filtering, and ordering already exist on `LessonResource`.

### 5. Keep AI proposals to a separate on-demand endpoint

`POST /api/admin/lessons/[lessonId]/resource-suggestions` uses `withAdmin(..., { mutation: true })`, calls the service, and returns `{ resources }`. The service caps one request at 8 proposals, validates each independently, and discards invalid entries while keeping valid ones. Invalid means missing/empty/overlong title, or a URL that is not an absolute HTTP(S) address within the existing limits. Descriptions over 500 characters are truncated. `parseResourceUrl` normalizes the URL and derives `kind`/`youtubeId`, so a YouTube proposal becomes an embeddable `YOUTUBE` resource.

If the lesson is already at the per-lesson resource cap, the service returns a `resource_limit_reached` conflict. If the provider fails, it throws a normal `AppError`, creating no rows. The route never fetches a proposed URL.

Alternative considered: generating proposals during lesson generation. Rejected because the teacher explicitly wants a button, and generating unrequested links would consume tokens and clutter the review queue.

### 6. Provider schemas allow per-item recovery

Topic responses use a permissive array-of-strings schema; normalization and limits happen in `lib/topics.ts`, so one overlong tag does not discard the rest. Suggestion responses use an array of `{ title, description?, url }` with a maximum item count; each item is validated and normalized before persistence. Prompts identify lesson content as data, request strict JSON, prefer well-known YouTube videos and reputable educational game sites, and tell the model not to invent video identifiers. `PROMPT_VERSION` is bumped because the generation prompt set changes.

### 7. UI uses existing admin patterns

`ResourceManager` gets a "Suggest games & videos" button in its header, with a loading state that blocks repeat submissions. Successful responses are merged into the local resource state and the router refresh keeps counts current. AI proposals render with an `AI` source badge and an "unverified" hint, and continue to use the existing approve/dismiss actions.

`LessonTopicsEditor` sits above the resource manager on the lesson admin page. It renders Greek and English chips, an add field per locale, removable chips, and a save action with per-form status messages. Errors from the route are shown without discarding the teacher's unsaved draft.

All new labels are added to both `messages/el.json` and `messages/en.json`; no visible strings are hardcoded.

### 8. Additive database migration

The Prisma migration adds the nullable `topics` JSON column, the `topicsEdited` boolean with a false default, and the `AI` enum value. Nullable/additive changes are safe for old rows. PostgreSQL enum value addition is generated by Prisma as its own migration step; deploy the migration before the application code that writes `AI`. Rolling back code leaves the extra column/enum value harmless; dropping them is not required for rollback.

## Risks / Trade-offs

- **Hallucinated or dead URLs** → Proposals are always `SUGGESTED` with an explicit AI/unverified label; no automatic approval, no outbound validation, teacher review is mandatory.
- **Topic generation adds latency and token cost** → One bounded excerpt and a small output; skipped entirely when the teacher has edited topics; failures do not affect lesson readiness.
- **Teacher edits could be overwritten on regeneration** → `topicsEdited` suppresses AI topic replacement once the teacher saves.
- **On-demand suggestion call can be slow** → The UI blocks repeat submission and shows progress; output is capped at 8 items.
- **Concurrent suggestion requests could race the cap or fingerprint checks** → `LessonResource` has a unique `(lessonId, fingerprint)` constraint and creation runs in a transaction with `skipDuplicates`.
- **Per-request usage from suggestion calls is not visible in lesson cost totals** → Accepted for this change; the call is logged. A later change can add a suggestion-run record if cost reporting is needed.
- **Prompt injection inside uploaded PDFs** → Existing system prompts already constrain the model and the output is schema-validated; topics and suggestions are treated as untrusted data and never executed.
- **New AI source in existing views** → The resource manager and any source-label mapping must handle `AI`; student filtering remains status-based, so students are unaffected.

## Migration Plan

1. Add the Prisma schema fields, the `AI` enum value, and generate/commit the migration.
2. Deploy the migration, then the code that reads/writes `topics` and `AI` sources.
3. Existing lessons have `topics = null` and `topicsEdited = false`; the admin UI treats them as empty and regeneration can populate them.
4. Rollback: revert application code. The nullable column and enum value can remain; no data backfill or destructive step is needed.

## Open Questions

None that affect the specs, approach, or task breakdown. The per-request cost-reporting gap is accepted and recorded above.
