# Design

## Context

See `proposal.md` for motivation and `specs/` for the behavior contract.

This is a greenfield repository containing only OpenSpec artifacts. The system will be built and operated by one teacher on a self-hosted Docker host, with students accessing it through share links from phones and laptops. The workload is bursty: a batch of PDFs is uploaded, then CPU-heavy extraction, AI generation, TTS, and video rendering run for minutes, while student traffic is light and latency-sensitive.

Hard constraints:

- Long-running jobs (AI calls, ffmpeg) cannot live inside a request lifecycle.
- The OpenAI key and teacher password must never reach the browser.
- PostgreSQL is the source of truth; PDFs and generated media are private files.
- Greek and English are both first-class, with Greek as the default.
- Deployment must remain understandable to a single operator: one Compose stack, one database, one media volume.

## Goals / Non-Goals

**Goals:**

- A reliable, resumable pipeline from upload to published lesson artifacts.
- Server-authoritative assessment so students cannot read or forge answers.
- Bilingual content that stays aligned item-by-item across locales.
- Simple, reproducible self-hosting with clear failure recovery.
- A student experience that works on a phone with no account or install.

**Non-Goals:**

- Horizontal scaling, multi-region deployment, or Kubernetes.
- Multi-teacher tenancy or role management beyond the single teacher.
- Student accounts, email, SSO, or LMS integration.
- OCR for scanned PDFs; image-only PDFs fail with a clear message.
- Manual question editing or a teacher content-review workflow in this change.
- Live multiplayer game sessions or real-time classrooms.
- Object storage/CDN; the storage adapter leaves room for S3 later.

## Decisions

### 1. Runtime: Next.js App Router + a separate Node worker

Use Next.js 15 (App Router, React Server Components) with TypeScript for the web app and a separate compiled Node process for background jobs.

- Web owns UI, authenticated admin APIs, student APIs, and media streaming.
- Worker owns PDF extraction, OpenAI calls, TTS, and ffmpeg.
- Shared code lives in `src/server/**` and `src/lib/**`, imported by both.
- The worker is a separate Docker image target (or the same image with a different entrypoint) so ffmpeg/Poppler weight is present in both.

Alternatives considered: serverless functions (Vercel) were rejected because ffmpeg, long AI calls, and persistent local media conflict with execution limits; a separate Python service was rejected as unnecessary operational overhead.

### 2. Database: PostgreSQL 16 with Prisma

Prisma provides typed access, migrations, and a clear schema for the relational core. Key tables:

- `Class` — name, description, color, position.
- `Lesson` — `classId`, title, original filename, storage key, SHA-256 checksum, size, page count, source locale, status, failure reason, retake flag, pass threshold, timestamps.
- `LessonPage` — page number and extracted text (also enables grounding checks).
- `GenerationJob` — lesson, stage, status, attempts, model, prompt version, token counts, estimated cost, error, timestamps.
- `Card` + `CardTranslation` — locale-independent item key/position/source page; per-locale prompt and answer.
- `Question` + `QuestionTranslation` — mode (`QUESTIONNAIRE`/`GAME`), item key, position, type, correct option ID, source page; per-locale prompt, options, explanation. Keeping the answer key on the locale-independent row guarantees alignment.
- `NarrationSegment` — lesson, page, locale, script, audio key, duration.
- `VideoAsset` — lesson, locale, status, media keys, duration, size, error.
- `ShareLink` — token hash, optional class or lesson scope, expiry, revocation, last access.
- `Attempt` + `AttemptAnswer` — student name and normalized name, mode, score, max score, percentage, pass flag, duration, reached level, locale, timestamps, idempotency key.
- `AttemptDraft` — resumable questionnaire answers keyed by lesson, normalized name, and expiry.
- `DeckView` — lesson, normalized name, completion time.

Use enums for lesson status, job stage/status, question mode/type, and video status. Add indexes on `(classId, position)`, `(lessonId, mode, position)`, `(lessonId, normalizedStudentName)`, and `ShareLink.tokenHash`.

Alternatives considered: Drizzle (lighter, but weaker migration ergonomics for this schema), MongoDB (poor fit for relational scoring/analytics).

### 3. Authentication: env password + signed HttpOnly session

The teacher credential comes from `TEACHER_PASSWORD` (plaintext convenience) or `TEACHER_PASSWORD_HASH` (Argon2id, preferred). Comparison is timing-safe. On success, issue a signed JWT session cookie (`jose`, HS256, `AUTH_SECRET`) with `HttpOnly`, `Secure` in production, `SameSite=Lax`, 7-day absolute expiry, and a session version. Logout clears it.

- Admin route handlers verify the session and re-check the Origin header on mutations; Server Actions rely on Next.js origin checks plus the session check.
- Login failures are counted in Redis per IP with a sliding window and temporary lockout.
- Missing password or secret produces a startup health failure, not a permissive fallback.

Alternatives considered: Auth.js (adds account/session tables and complexity for one password), HTTP Basic (no logout, poor UX, credentials resent constantly).

### 4. Queue: BullMQ on Redis with discrete, idempotent stages

Each lesson runs as a sequence of jobs rather than one monolith:

1. `extract` — validate, checksum, page count, text extraction, page images.
2. `generate` — chunking, OpenAI structured generation, cross-locale validation, commit artifacts.
3. `tts` — narration audio per page and locale.
4. `render` — ffmpeg composition, captions, poster.

Job IDs are deterministic (`lessonId:stage:attempt`) so duplicate enqueues dedupe. Every stage is safe to re-run: it writes to a staging path/transaction and promotes on success. Retries use exponential backoff; 429/5xx/timeouts are retryable, schema failures are retried a bounded number of times, and permanent failures become `FAILED` with a human-readable reason. Worker concurrency defaults to 2 for AI stages and 1 for render on a 4 vCPU host.

Lesson status is derived from stage outcomes: `QUEUED → EXTRACTING → GENERATING → RENDERING → READY`, with `FAILED` and `CANCELLED` as terminal states. `RENDERING` failure sets the video asset to failed but leaves the lesson `READY`.

Alternatives considered: a single long job (poor retry granularity, BullMQ lock renewal risk), Postgres-backed polling queue (workable but adds contention and custom code).

### 5. Storage: private local volume behind an adapter

`STORAGE_ROOT` (default `/data`) holds:

```
lessons/<lessonId>/original.pdf
lessons/<lessonId>/pages/<n>.png
lessons/<lessonId>/audio/<locale>/<n>.mp3
lessons/<lessonId>/video/<locale>.mp4
lessons/<lessonId>/video/<locale>.vtt
lessons/<lessonId>/video/<locale>.jpg
```

A `Storage` interface (`put`, `getStream`, `stat`, `deletePrefix`) is backed by the filesystem now and can be replaced by S3 later. Files are served only through token-authorized routes that verify the teacher session or a valid share token and support HTTP Range for video. `public/` never contains lesson data. Deletion uses prefix cleanup with a retryable cleanup job.

### 6. PDF processing: text-first, render pages separately

- Text and page count: `unpdf`/`pdfjs-dist` (pure JS, no native service dependency).
- Page images: Poppler `pdftoppm` at 150–200 DPI, letterboxed to 1920×1080 for video.
- If a PDF yields little or no usable text, fail early as unsupported (no OCR), as required by `lesson-generation`.
- Enforce a configurable page limit before rendering to protect disk and render time.

### 7. AI generation: one structured, bilingual response per artifact

- Use the OpenAI Responses API with strict JSON Schema structured outputs.
- One request produces both locales per artifact, with a canonical item key and a correct option ID shared across locales. This is why the schema separates locale-independent answer keys from localized text.
- Grounding: include page-tagged source text and require a `sourcePage` for each item. Validate that the page exists and that the item text is supported by that page's text; discard and regenerate invalid or duplicate items.
- Prompts are versioned (`promptVersion`) so regenerated content can be compared and rolled back conceptually.
- Long documents: if the page-tagged text exceeds the model budget, build a per-page summary map first, then generate from the summary with page references preserved.
- Temperature is low (0.2–0.4). Output counts come from configuration per artifact, within the ranges in the specs.
- Default text model configurable (`OPENAI_TEXT_MODEL`); generation commits only after schema, counts, answer-key, duplicate, source-page, and locale-alignment validation pass.
- Student data is never included in prompts, enforced at the prompt-builder boundary.

Alternatives considered: generate in Greek then translate (translation drift can break answer alignment and explanation meaning), one call per artifact per locale (double cost and drift).

### 8. Speech and video: TTS per page, ffmpeg composition

- TTS: OpenAI speech synthesis, one audio file per page, per locale, with configurable voice (`OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE_EL`, `OPENAI_TTS_VOICE_EN`).
- Measure each audio duration with ffprobe. Slide duration = audio duration + configurable pause (default 0.6 s).
- Render each slide as a still-image video segment at 1920×1080, 30 fps, then concat with the audio track. Encode H.264 `yuv420p`, AAC 48 kHz, `+faststart`.
- Build WebVTT captions from the narration script using the measured segment timings.
- Render in a temp directory with a timeout and cleanup in `finally`; concurrency is 1 by default.
- Primary locale is rendered automatically; other locale variants are queued on demand.
- Video failure never blocks the text artifacts, matching `video-presentation`.

### 9. Student access and assessment integrity

- Share tokens are 32 random bytes (base64url), stored only as SHA-256 hashes. The URL carries the raw token; the server hashes and looks it up. Optional expiry and immediate revocation.
- Name entry creates a signed student cookie scoped to the token and lesson. The name is stored as entered; a normalized form (Unicode NFKC, trimmed, collapsed whitespace, case-folded) is used for uniqueness and analytics.
- Question payloads omit `correctOptionId`, explanations, and answer keys. The client submits `{questionId, optionId}`; the server grades against the database and returns only the result.
- Questionnaire submission is idempotent through a client-generated idempotency key and a transaction; one attempt per normalized name per lesson is enforced unless `Lesson.retakesEnabled`.
- Game sessions are server-side attempts with a session token; lifelines are computed on the server from the answer key. Ask-the-audience distributions are generated server-side with a bias toward the correct answer but not certainty.
- Draft autosave writes to `AttemptDraft` with a short TTL and is never counted as an attempt.
- Rate-limit student answer submissions and name entry to contain abuse.

### 10. Internationalization: path-based `next-intl`

- Routes are prefixed with `/el` and `/en`; `/` redirects to the negotiated locale (Greek default).
- Resolution order: explicit path/cookie choice, stored cookie, `Accept-Language`, default. A locale switch writes the cookie and navigates without losing lesson state.
- UI strings live in message catalogs; no visible string in components. Missing keys fall back to Greek and never render keys.
- Generated content is stored per locale. Student-facing modes request the selected locale and fall back to the lesson's primary locale with a visible notice.
- Dates, numbers, and percentages use `Intl` with the active locale.
- Content has an `availableLocales` derived value, so share pages can disable or label missing variants.

### 11. UI and interaction

- Tailwind CSS + shadcn/ui for layout and controls; server components for admin lists; client components for the game, card deck, and questionnaire.
- Framer Motion for card and ladder animations; Howler.js for sounds. A persisted mute preference and `prefers-reduced-motion` are honored at the component level.
- Lesson tabs are URL state (`?tab=cards|video|game|quiz`) so deep links work and reloads keep context.
- Processing status uses Server-Sent Events from an authenticated admin endpoint, with 3-second polling as fallback.
- Admin pages: login, class list, class detail (lessons + upload + statuses), lesson detail (artifacts, usage, share links, results), class results, settings summary.

### 12. Deployment: one Docker Compose stack

Services: `web`, `worker`, `postgres`, `redis`, and optional `caddy` for TLS.

- Web runs `next start` (standalone output); worker runs the compiled job entrypoint.
- Entrypoints run `prisma migrate deploy` once (web) before serving; worker waits for Postgres/Redis health.
- Volumes: `pgdata` and `media` (`/data`). Both are required for restore.
- Health endpoints check DB, Redis, storage writability, and required env.
- Env: `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL`, TTS settings, `TEACHER_PASSWORD`/`TEACHER_PASSWORD_HASH`, `AUTH_SECRET`, `APP_BASE_URL`, `STORAGE_ROOT`, `DEFAULT_LOCALE`, upload/page/video limits.
- Backups: nightly `pg_dump` plus media volume snapshot/rsync; documented restore drill.
- Recommended host: 4 vCPU / 8 GB RAM / 100 GB SSD for a single class load; ffmpeg is the CPU peak.

### 13. Observability and failure handling

- Structured JSON logs (`pino`) with request IDs and job IDs; secrets and tokens redacted.
- `GenerationJob` records model, tokens, estimated cost, attempts, and error class; a class usage summary is derived from it.
- Processing events are persisted for the teacher timeline.
- A `/api/health` endpoint reports dependency status; Compose healthchecks restart unhealthy containers.
- Stalled BullMQ jobs are retried; idempotent stages prevent duplicate artifacts.

### 14. Testing strategy

- Unit (Vitest): name normalization, scoring/pass logic, token hashing, option validation, cross-locale alignment, CSV formatting.
- Integration: Postgres and Redis via Testcontainers; upload validation, attempt idempotency, share-token authorization, job stage transitions.
- Pipeline contract tests: recorded/fixtured OpenAI structured responses validated against schemas; ffmpeg smoke test on a 2-page PDF.
- E2E (Playwright): teacher login → class creation → upload (queue mocked) → publish → share link → name entry → cards/game/questionnaire → teacher results.
- Security checks: unauthenticated admin access, student token on admin route, answer-key leakage in payloads, revoked/expired links.

## Risks / Trade-offs

- **AI hallucination or off-syllabus items** → page-grounded prompts, mandatory `sourcePage`, source-text checks, duplicate rejection, deterministic validation, low temperature; a human review workflow is deliberately deferred and should be the next safety investment.
- **Bilingual drift** → generate both locales in one structured response with shared answer keys; reject items whose keys/answers do not align.
- **Scanned PDFs fail** → fail early with a clear message and mark OCR as out of scope; document the limitation for the teacher.
- **OpenAI cost overruns** → per-lesson token/output caps, configurable models, usage records, and a class usage view; no automatic retry storm beyond the bounded retry policy.
- **Video is CPU- and disk-heavy** → page/duration limits, render concurrency 1, temp cleanup, storage monitoring, and video failure isolated from the rest of the lesson.
- **Single worker is a single point of failure** → restart policy, idempotent stages, stalled-job recovery, and retry from the UI.
- **Self-hosted secrets** → `.env` never baked into images, `Secure` cookies behind TLS, hashed share tokens, Argon2 password option, redacted logs.
- **Local media volume growth** → deletion cascades, cleanup jobs, retention policy for failed jobs, and disk health checks.
- **Greek TTS quality varies** → configurable model/voice and per-lesson regeneration without touching cards or questions.
- **Prisma/BullMQ bundling into client code** → keep queue and Prisma imports in server-only modules and separate the worker entrypoint.

## Migration Plan

This is a greenfield deployment, so there is no data migration:

1. Build images and start `postgres`/`redis`; apply the initial Prisma migration.
2. Start `web` and `worker`; verify health and OpenAI connectivity with a dry-run generation.
3. Create the first class, upload one small PDF, and confirm the lesson reaches `READY` with all artifacts and a video.
4. Create a share link and complete a student pass on mobile.

Rollback: stop `web` and `worker`, restore the previous database dump and media snapshot, then restart. Migrations are forward-only; later changes use expand/contract patterns (add nullable columns, backfill, then remove old fields).

Backup requirements: nightly `pg_dump`, daily media snapshot, and a documented quarterly restore test.

## Open Questions

- Final default card/question/game counts and the default pass threshold (proposed: 12 cards, 15 questionnaire items, 12 game questions, 60% pass).
- Which Greek and English TTS voices to use by default; this can be tuned by configuration after listening tests.
- Backup cadence and media retention beyond the proposed nightly/daily defaults, depending on the host's disk size.
