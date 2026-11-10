# Speech and video

## Pipeline

```
teacher requests a locale
  → story preparation (one bilingual story with scene/page anchors)
  → POST to the configured AI video provider
  → poll provider job
  → download and validate MP4 / WebVTT / poster
  → READY
```

Content generation finishes without queueing media. Video is generated on demand: the teacher chooses Generate or Recreate for a locale on the lesson detail page. The first request prepares the story; later requests for the other locale and Recreate reuse it until content generation publishes a new lesson version.

The former local pipeline (`NARRATION` → `TTS` → `VISUAL` → `RENDER`) remains in the source tree for rollback/reference but is no longer invoked by the video route.

## Story generation

- Input: the lesson title and the extracted, page-tagged text from `LessonPage`. The raw PDF is not sent to the provider.
- Output: one bilingual story with a title, logline, and ordered scenes. Every scene contains Greek and English narration and at least one valid source-page anchor.
- Long lessons are drafted in bounded chunks that keep `[Page N]` markers, then merged in one pass into a single arc. Chunk draft keys are made unique before the merge.
- Validation requires the configured scene range, both locales, valid page anchors, and coverage of every substantive page. One targeted repair request is made for missing or invalid material.
- A story is stored per lesson content version. `publishArtifacts` deletes it when new cards/questions are published, and `cancelLesson` deletes it on cancellation.
- Story model: `STORY_MODEL` (defaults to `OPENAI_TEXT_MODEL`). Prompt version: `story-v1`. Usage and estimated cost are recorded on the `STORY` generation job.

## Video provider

Video generation requires an external AI video server. The adapter is intentionally isolated in `src/server/video/http-provider.ts`.

```bash
VIDEO_PROVIDER=api              # api, mock, or disabled (default)
VIDEO_AI_BASE_URL=https://video.example.com/api
VIDEO_AI_API_KEY=                # sent as a bearer token when set
VIDEO_AI_MODEL=                  # optional, forwarded to the provider
VIDEO_AI_POLL_INTERVAL_MS=5000
VIDEO_AI_REQUEST_TIMEOUT_MS=60000
VIDEO_AI_TIMEOUT_SECONDS=1800
VIDEO_MAX_OUTPUT_BYTES=536870912
```

`VIDEO_PROVIDER=mock` uses bundled local fixtures and makes no network calls. `disabled` keeps existing media playable but fails new requests with a clear reason.

### Proposed HTTP contract

```
POST {base}/videos
Authorization: Bearer <key>
{
  "idempotencyKey": "<lesson>:<locale>:<contentVersion>:<run>",
  "lessonId": "...",
  "locale": "el",
  "model": "...",
  "title": "...",
  "story": {
    "title": "...",
    "logline": "...",
    "scenes": [
      { "sceneKey": "...", "sourcePages": [1, 2], "narration": "...", "visualDirection": "..." }
    ]
  }
}
→ 202 { "id": "job_123", "status": "queued" }

GET {base}/videos/{id}
→ 200 {
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

Output URLs may be absolute or relative to `VIDEO_AI_BASE_URL`. A `409` on submit with an existing idempotency key returns the existing job id. A completed job without a video URL is a failure.

### Lifecycle

- `STORY` prepares or reuses the story and enqueues `VIDEO_SUBMIT`.
- `VIDEO_SUBMIT` stores the provider job id, provider name, content version, idempotency key, and submission time, then enqueues the first `VIDEO_POLL`.
- `VIDEO_POLL` is a short delayed job. In-progress states keep the variant `RENDERING` and re-enqueue after `VIDEO_AI_POLL_INTERVAL_MS`. Terminal states stop polling.
- A worker restart runs `resumeVideoJobs()`, which re-enqueues polling for stored provider job ids and story submission for pending variants.
- The overall provider timeout is measured from `submittedAt` against `VIDEO_AI_TIMEOUT_SECONDS`.

### Output ingestion

- The MP4 must be non-empty, a video content type (or an `.mp4` URL), within `VIDEO_MAX_OUTPUT_BYTES`, and playable according to `ffprobe`.
- The probed duration must not exceed `MAX_VIDEO_SECONDS`; a provider-reported duration is checked before download.
- At least 512 MB of free storage is required.
- Outputs are stored at the existing keys:

```
lessons/<lessonId>/video/<locale>.mp4
lessons/<lessonId>/video/<locale>.vtt   (when supplied)
lessons/<lessonId>/video/<locale>.jpg   (when supplied)
```

- Captions and poster are optional. Playback omits missing tracks/assets.
- A variant is marked `READY` only after all checks and storage writes succeed.

### Failure isolation and previous media

- Story or provider failures mark only the requested locale `FAILED`; the lesson remains `READY` and cards, questions, game, attempts, and the other locale are untouched.
- A duration over the limit marks the variant `SKIPPED` with the reason.
- Provider outages, rate limits, timeouts, and invalid output mark the variant `FAILED` with an actionable reason.
- Recreate preserves the previous `storageKey`/`captionsKey`/`posterKey`. Media routes serve a file whenever its key exists, even while the new variant is `PENDING` or `RENDERING` or after a failed recreate. The UI continues to offer Play for that stored video while showing the new status/error.

## Student ambience

The game and questionnaire share a looping background track at `public/audio/student-ambience.mp3`.

- The loop is generated locally from a synthetic I–V–vi–IV progression, so it has no third-party license or network dependency. Regenerate it with `./scripts/generate-ambience.sh`; the script writes a 32-second, mono, 96 kbps file through ffmpeg.
- It is served from the app origin at `/audio/student-ambience.mp3` and played at volume `0.16` under the game's sound effects.
- Audio starts only after a student interaction. Muting, shared by the game and questionnaire, stores `lessonlab:muted` in `localStorage` (`"1"` muted, `"0"` unmuted) and defaults to sound on when the key is absent.
- The ambient layer pauses while the tab is hidden and stops when a game or questionnaire session ends. A missing or blocked audio file leaves the activity fully usable and silent.

## Limits and troubleshooting

- `MAX_PDF_PAGES` bounds the extracted lesson.
- `MAX_VIDEO_SECONDS` bounds provider duration and the downloaded file.
- `VIDEO_MAX_OUTPUT_BYTES` bounds each downloaded output.
- `VIDEO_AI_REQUEST_TIMEOUT_MS` bounds a single HTTP call; `VIDEO_AI_TIMEOUT_SECONDS` bounds the whole provider job.
- Provider unavailable: check `VIDEO_AI_BASE_URL`, the API key, and provider health, then Recreate.
- Provider timeout: raise `VIDEO_AI_TIMEOUT_SECONDS` or investigate provider queue time.
- Video too long: reduce the story length or raise `MAX_VIDEO_SECONDS`.
- Invalid output: verify the provider returns an MP4, and VTT/JPG when it advertises captions/poster.
- Missing captions: the provider did not return a VTT URL or the download failed; playback still works.
- Previous video still plays after a failure: this is intentional. Recreate when the provider is healthy.
- `VIDEO_PROVIDER=disabled`: configure `VIDEO_PROVIDER=api` and `VIDEO_AI_BASE_URL` to enable new video requests.

## Legacy local media

The following modules still exist but are not part of the video path:

- `src/server/media/tts.ts` and `src/worker/processors/tts.ts`
- `src/server/media/render-video.ts` and `src/worker/processors/render.ts`
- `src/server/media/lesson-visual.ts`, `src/worker/processors/visual.ts`, and character artwork

They can be removed in a follow-up after the provider path is proven. Existing stored videos from the legacy renderer remain playable through the same media routes.
