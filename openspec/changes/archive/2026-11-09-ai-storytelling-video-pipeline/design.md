# Design

## Context

See `proposal.md` for motivation. The current pipeline lives in three places: `src/server/pdf/extract.ts` (unpdf text extraction), `src/server/generation/*` (structured text generation and per-page narration), and `src/server/media/*` plus `src/worker/processors/{tts,visual,render}.ts` (TTS, character artwork, ffmpeg composition). Video is requested manually per locale through `POST /api/admin/lessons/[lessonId]/video`, stored on `VideoAsset`, and served through the existing admin/share media routes.

Constraints that shape the design:

- Postgres + Prisma own durable state; Redis + BullMQ run background work with retries and delayed jobs.
- The worker currently runs at concurrency 2 and relies on job ids for deduplication.
- The existing media contract (`lessons/<id>/video/<locale>.mp4`, `.vtt`, `.jpg`) and the admin/student media routes should remain stable.
- The exact external video server contract is not yet known. The adapter must isolate protocol mapping from the rest of the pipeline.
- No student data may leave LessonLab; only lesson title, page text, story, locale, and provider job metadata are sent.

## Goals / Non-Goals

**Goals:**

- Add one story-generation domain that turns extracted pages into a validated bilingual story with scene-to-page anchors.
- Submit stories to a configurable external video provider, track the provider job durably, and ingest the finished media.
- Keep the teacher-triggered, per-locale video behavior and all failure isolation.
- Keep the existing storage keys, media routes, and player components working with provider output.
- Make provider failure, timeout, and worker restart recoverable and observable.

**Non-Goals:**

- Parsing the PDF inside the video provider or sending the raw PDF. Extraction stays in `processExtract`.
- Generating cards, questionnaire, or game content differently.
- Deleting the legacy TTS, ffmpeg, narration, or character-art modules in this change. They remain in the tree, unwired from the video path, until a follow-up cleanup.
- Provider-side video editing, teacher story editing, or a story review UI.
- Webhook-based provider callbacks. Polling is the baseline; a callback can be added behind the same adapter later.
- Guaranteeing a specific provider's creative quality. The story contract and output validation define the floor.

## Decisions

### 1. Model the story as a first-class domain

Add `LessonStory` and `StoryScene` instead of overloading `NarrationSegment`.

- `LessonStory`: `id`, `lessonId` (unique), `jobVersion`, `status` (`PENDING | GENERATING | READY | FAILED`), `title`, `logline`, `model`, `promptVersion`, `sourceLocale`, `error`, timestamps.
- `StoryScene`: `id`, `storyId`, `position`, `sceneKey`, `sourcePages` (JSON int array), `narrationEl`, `narrationEn`, `visualDirection`, unique `(storyId, sceneKey)`.

Rationale: the story is lesson-level and locale-independent, while narration was page-and-locale-level. A dedicated model makes "one story, two locales" explicit and lets the provider request carry a clean structure. Alternative: reuse `NarrationSegment` with a synthetic `sceneNumber`; rejected because it conflates page narration with narrative scenes and cannot express multi-page scenes cleanly.

`jobVersion` on the story ties it to the lesson content version. `publishArtifacts` deletes the story (and cascading scenes) in the same transaction that replaces cards/questions, so a stale story can never be submitted after regeneration. The old narration deletion can remain temporarily or be removed when the legacy rows are cleaned up.

### 2. Generate stories with the existing content-provider abstraction

Add `story(input): Promise<ProviderResult<RawStory>>` to `ContentProvider` and implement it in the OpenAI and mock providers, reusing the existing Responses API structured-output path, `strictify`, usage extraction, and `estimateCost`. Leave the existing `narration` method in place for legacy code but do not call it from the video pipeline.

Story schema:

```ts
{
  title: string,
  logline: string,
  scenes: Array<{
    sceneKey: string,
    sourcePages: number[],
    narration: { el: string, en: string },
    visualDirection?: string
  }>
}
```

Validation and normalization:

- scenes sorted by returned order, then renumbered by position;
- `sceneKey` unique; duplicate keys are dropped after keeping the first;
- at least `STORY_MIN_SCENES` and at most `STORY_MAX_SCENES` (defaults 3 and 20);
- every `sourcePages` entry must exist in `LessonPage`;
- Greek and English narration non-empty and within the existing locale text bounds;
- every substantive page (non-whitespace text length > 20) must be cited by at least one scene.

One targeted repair pass is made with the missing page numbers and validation reasons when the first response is incomplete. If repair still fails, the story job is marked `FAILED` and only the requesting locale's variant fails.

### 3. Handle long documents with chunk drafts plus one merge pass

When page-tagged text exceeds `STORY_CHUNK_CHARS` (default 48k, matching the existing generator budget), the story stage:

1. splits pages into bounded chunks that retain `[Page N]` markers;
2. asks for story beats per chunk (scenes with page anchors, no forced beginning/end);
3. makes one merge request containing the ordered beats and asks for a single arc, a title, and a logline;
4. validates the merged story against the full lesson page set.

The merge pass is what prevents concatenated chunk stories. If the merge output is invalid, one retry is allowed; after that the variant fails rather than storing a non-story. Shorter documents use a single story request.

### 4. Extract the video server behind a provider adapter

Add a `VideoProvider` interface:

```ts
type SubmitInput = {
  lessonId: string;
  locale: "el" | "en";
  contentVersion: number;
  idempotencyKey: string;
  title: string;
  story: { title: string; logline: string; scenes: Array<{ sceneKey: string; sourcePages: number[]; narration: string; visualDirection?: string }> };
};

type ProviderJob = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress?: number;
  error?: string;
  outputs?: { videoUrl: string; captionsUrl?: string; posterUrl?: string };
  durationSeconds?: number;
};

interface VideoProvider {
  submit(input: SubmitInput): Promise<{ id: string; status: string }>;
  getJob(id: string): Promise<ProviderJob>;
  download(url: string): Promise<{ body: Uint8Array; contentType: string | null }>;
}
```

Implementations:

- `HttpVideoProvider` (`VIDEO_PROVIDER=api`): bearer auth when `VIDEO_AI_API_KEY` is set, base URL from `VIDEO_AI_BASE_URL`, `VIDEO_AI_MODEL` forwarded when configured.
- `MockVideoProvider` (`VIDEO_PROVIDER=mock`): deterministic completed job with bundled tiny MP4/VTT/JPG fixtures; no network.
- `disabled` (`VIDEO_PROVIDER=disabled`): submission fails with `video_provider_disabled`.

Proposed HTTP contract (the adapter is the only mapping point if the real server differs):

```
POST {base}/videos
Authorization: Bearer <key>
{
  "idempotencyKey": "...",
  "lessonId": "...",
  "locale": "el",
  "model": "...",
  "title": "...",
  "story": { "title": "...", "logline": "...", "scenes": [...] }
}
-> 202 { "id": "job_123", "status": "queued" }

GET {base}/videos/{id}
-> 200 {
  "id": "job_123",
  "status": "queued|processing|completed|failed",
  "progress": 40,
  "error": null,
  "durationSeconds": 84,
  "outputs": {
    "videoUrl": "https://.../video.mp4",
    "captionsUrl": "https://.../captions.vtt",
    "posterUrl": "https://.../poster.jpg"
  }
}
```

Output URLs may be absolute or relative to the base URL. A `409` on submit with an existing idempotency key returns the existing job id. A completed job without a video URL is a terminal failure.

Alternative: a vendor SDK. Rejected because the concrete server is unknown and an SDK would leak vendor types into worker and tests. A webhook callback is also deferred; polling is simpler to make durable and testable.

### 5. Drive the provider lifecycle with durable delayed polling

Add stages:

- `story`: ensure the story, then enqueue `video-submit`.
- `video-submit`: create the provider job, store its id and idempotency key, enqueue the first `video-poll`.
- `video-poll`: fetch status; on completion ingest; on failure stop; otherwise re-enqueue a poll after `VIDEO_AI_POLL_INTERVAL_MS`.

`VideoAsset` gains:

- `provider`, `providerJobId`, `providerStatus`, `progress`;
- `contentVersion` (story version submitted);
- `idempotencyKey` (unique);
- `submittedAt`, `completedAt`.

State mapping:

- submit accepted / provider `queued` or `processing` → `VideoAsset.status = RENDERING`;
- `completed` + successful ingest → `READY`;
- `failed` → `FAILED`;
- timeout or invalid output → `FAILED` (or `SKIPPED` for configured limits);
- provider unavailable/rate limited → `FAILED` with an actionable reason.

Why delayed BullMQ jobs instead of one long-running polling loop: a long loop holds a worker slot, complicates lock renewal, and loses all progress on restart. With delayed jobs, each poll is short and Redis persists the next poll. To cover Redis loss or a worker restart between polls, add `resumeVideoJobs()` on worker startup: query active `VideoAsset` rows and enqueue the appropriate stage based on `providerJobId` and story state. This function must be idempotent and safe to run in every worker instance.

Idempotency is enforced at two levels: the existing route rejects PENDING/RENDERING requests, and `idempotencyKey = <lessonId>:<locale>:<contentVersion>` is stored uniquely and sent to the provider. Recreate after a terminal state gets a new key only when the content version changes; otherwise the same key can safely resolve to a completed job or a fresh provider call depending on provider behavior. To force a true re-render with the same content, include the video request's `runId` in the key.

### 6. Ingest provider output into the existing media contract

On completion:

1. Re-check that the story still belongs to the lesson's current `jobVersion`; if not, fail the variant instead of ingesting stale media.
2. Download the MP4 to a temp directory. Enforce `VIDEO_MAX_OUTPUT_BYTES` and the existing 512 MB free-disk guard.
3. Verify the response is a video content type or an `.mp4` URL, the file is non-empty, and `ffprobe` reports a duration. Enforce `MAX_VIDEO_SECONDS` using provider metadata when present, otherwise the probed duration.
4. Store the MP4 at `lessons/<lessonId>/video/<locale>.mp4`, captions (when supplied) at `.vtt`, and poster (when supplied) at `.jpg` through `storage.putFile`.
5. Update `VideoAsset` with `durationMs`, `sizeBytes`, `storageKey`, `captionsKey`, `posterKey`, `providerStatus`, `completedAt`, and clear `error`.

If captions or poster are absent, store `null` and let playback omit those tracks/assets. This changes the current assumption that every `READY` variant has all three files; the media routes and player must check keys, not just status.

### 7. Preserve the previous successful media during recreate

The current render path leaves storage keys on `VideoAsset` while setting `RENDERING`, but the media routes refuse anything that is not `READY`. That would make the old video unavailable during a recreate and after a failed recreate.

Decision: media availability is based on the stored key, not only on status. The admin/student media routes serve a file when its key exists, and the UI offers Play when a key exists. `status` still drives processing/failure labels. On successful ingest, the keys are replaced; on failure, the old keys stay and the new error is shown. On first generation there are no keys, so behavior is unchanged.

### 8. Keep the lesson and variant status model

- Story/provider work never changes `Lesson.status`; the lesson remains `READY` after content generation.
- The video route still upserts `VideoAsset` to `PENDING` before queueing.
- `processStory` and provider processors set `FAILED` on the requested locale only.
- `worker.on("failed")` is updated so `story`, `video-submit`, and `video-poll` call a media-failure helper that marks the variant (and story job for `story`) instead of failing the lesson. The legacy `narration`, `tts`, `visual`, and `render` branches can remain until those stages are deleted.

### 9. Configuration and validation

Add to `src/lib/env.ts`:

```bash
VIDEO_PROVIDER=api|mock|disabled   # default disabled
VIDEO_AI_BASE_URL=                  # required when api
VIDEO_AI_API_KEY=                   # sent as bearer when set
VIDEO_AI_MODEL=                     # optional provider model
VIDEO_AI_POLL_INTERVAL_MS=5000
VIDEO_AI_REQUEST_TIMEOUT_MS=60000   # per HTTP call
VIDEO_AI_TIMEOUT_SECONDS=1800       # whole provider job
VIDEO_MAX_OUTPUT_BYTES=536870912
STORY_MODEL=                        # defaults to OPENAI_TEXT_MODEL
STORY_MIN_SCENES=3
STORY_MAX_SCENES=20
STORY_CHUNK_CHARS=48000
```

`superRefine` requires `VIDEO_AI_BASE_URL` when `VIDEO_PROVIDER=api`. `mock` and `disabled` need no network configuration. Update `.env.example` and deployment docs.

### 10. Security and privacy

- Story and video requests contain lesson title, page text/story, locale, and provider identifiers only. No student names, attempts, results, or share tokens.
- Provider API keys stay server-side; they are never sent to the browser or stored in `VideoAsset`.
- Downloaded output is validated before publishing. The provider cannot write directly into storage.
- Existing share-token and teacher-session checks remain the only way to read media.

## Risks / Trade-offs

- **Unknown provider contract** → The HTTP contract is an assumption. Keep all mapping in one adapter with contract tests and a mock; adapt the real server without touching worker/story logic.
- **Provider latency and cost** → Long jobs consume no worker slot with delayed polling, but they do consume provider quota. Enforce timeouts, surface progress, and let the teacher retry only on terminal failure.
- **External outage** → Only the affected variant fails; lesson content stays available. Previous successful media remains playable because keys are preserved.
- **Story quality** → A single story arc can omit pages or drift from the source. Mitigate with page anchors, coverage validation, one targeted repair, and deterministic scene ordering; teachers can Recreate.
- **Long PDFs** → Chunk drafts + merge can lose details or produce too many scenes. Enforce scene limits and page coverage; fail rather than silently truncating.
- **Duplicate story generation across workers** → Use a conditional DB claim (`READY` reuse, `GENERATING` with a stale timeout) plus the in-process map. A rare duplicate call is acceptable and idempotent; a corrupt story is not.
- **Polling volume** → Fixed polling for many variants can create many delayed jobs. Use a modest interval, terminal states stop polling, and reconciliation avoids duplicates.
- **Migration** → Existing `VideoAsset` rows have no provider fields; they remain readable. Existing READY videos continue to play. New requests use the provider. Rollback is setting `VIDEO_PROVIDER=disabled`; the old code path can be restored while the added tables/columns remain unused.
- **Legacy modules** → TTS/ffmpeg/character code remains but is dead in the video path. This is intentional to keep the change reversible; schedule a cleanup follow-up.

## Migration Plan

1. Add the Prisma models/columns/enums and run `prisma migrate deploy`. This is additive and backward-compatible.
2. Land the story domain, provider adapter, and new worker stages behind `VIDEO_PROVIDER=disabled` (no behavior change until configured).
3. Switch `POST /api/admin/lessons/[lessonId]/video` to enqueue `story`. Existing READY videos remain playable.
4. Configure a staging provider and verify submit → poll → ingest with both locales and a recreate.
5. Update docs and `.env.example`; announce that video now requires the provider.
6. Rollback: set `VIDEO_PROVIDER=disabled` to stop new submissions, or redeploy the previous code. Added tables/columns can remain without affecting the old path. Existing provider jobs are left to expire; `resumeVideoJobs` is only called by the new worker.
7. Optional cleanup follow-up: delete `NarrationSegment`, the TTS/visual/render processors, character-art code, and their specs after the provider path is proven.

## Open Questions

- The real provider's exact submit/status/output field names, auth scheme, and whether it supports cancellation. These are confined to `HttpVideoProvider` and its tests; the specs and worker state machine do not depend on the answer.
- Whether the provider returns WebVTT captions and a poster, or only an MP4. The specs allow playback without them; if the provider never supplies captions, a follow-up can add local caption generation.
- Whether the provider accepts a webhook. If it does, a later change can add a callback that updates the same `VideoAsset` fields while keeping polling as fallback.
