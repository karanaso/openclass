# Design

## Context

See `proposal.md` for motivation and `specs/` for behavior. The relevant current state:

- Video rendering is a single worker processor (`processRender`) that renders PDF pages to PNG, then `composeLessonVideo` builds one H.264/AAC segment per slide and concatenates them. Audio duration plus a 600 ms pause sets each segment length.
- TTS runs per locale and enqueues render. Lesson regeneration increments `Lesson.jobVersion` and re-runs extract/generate/tts; the render job carries the version it should render.
- AI access is OpenAI-only for text and TTS, with deterministic mock providers selected by env. There is no image-generation client yet and no image-generation dependency beyond network access.
- Media lives under `lessons/<lessonId>/{pages,audio,video}` in private storage. Lesson deletion removes the whole lesson prefix; cancellation removes explicit subprefixes.
- The worker has ffmpeg and ffprobe available, and tests run real ffmpeg against a mock TTS provider.

OpenAI image generation is the only new external dependency. The design keeps the enhancement inside the existing render stage so the pipeline stays a single chain, and makes every visual step best-effort.

## Goals / Non-Goals

**Goals:**

- Generate exactly two source images per lesson: one scene and one 2×2 character sprite sheet.
- Produce a reusable alpha animation loop and compose it over a side-panel layout for every slide.
- Keep the visual path idempotent, version-aware, locale-independent, and unable to break video rendering.
- Keep development and CI deterministic and free via a mock image provider.

**Non-Goals:**

- Lip sync, speaking animation, or narration-driven gestures.
- Per-page scene generation, teacher image upload, or a teacher-facing art editor.
- Character presence in the lesson page UI; this change only affects the MP4 and poster.
- A separate retry control for artwork. Regenerating the lesson is the retry path.

## Decisions

### 1. Generate artwork inside the render stage, not a new pipeline stage

`processRender` calls `ensureLessonVisual(lesson)` before composing. It generates art if missing or stale, then proceeds regardless of the result.

- **Why:** a separate `visual` stage would need its own queue wiring and a failure path that still resumes TTS/render, plus a race where render starts before the visual job finishes. Keeping it in render preserves the existing linear pipeline and lets the existing render retry policy cover image generation.
- **Alternative rejected:** enqueue `visual` between generate and TTS. It adds latency and chain-recovery complexity for a best-effort enhancement.
- **Trade-off:** first render waits for image generation. This happens once per lesson version and only for lessons without current art.

### 2. One `LessonVisual` row per lesson, versioned by `jobVersion`

Add `LessonVisual` with a unique `lessonId`, status (`PENDING|GENERATING|READY|FAILED`), `jobVersion`, storage keys for scene/sheet/loop, model, prompt version, and error. Render uses the visual only when status is `READY` and `jobVersion` equals the lesson's current `jobVersion`.

- **Why:** regeneration must not mix old artwork with new lesson content, and concurrent locale renders must agree on the same art. The version check makes stale rows harmless without deleting them eagerly.
- **Alternative rejected:** delete art on regeneration. A race with an in-flight render can leave no row and regenerate twice; the version check is simpler.
- Record image usage in `GenerationJob` with a new `VISUAL` stage so model and failure reason are visible next to other pipeline jobs.

### 3. Image provider abstraction with OpenAI and mock implementations

New `ImageProvider` interface with `generateScene(input)` and `generateCharacterSheet(input)`, returning PNG bytes, extension, and model. OpenAI calls `POST /v1/images/generations`; the mock returns checked-in deterministic PNG fixtures.

- **Why:** mirrors the existing content/TTS provider pattern, keeps tests offline, and lets `IMAGE_PROVIDER=disabled` turn the feature off without code changes.
- Provider selection: explicit `IMAGE_PROVIDER` (`openai|mock|disabled`), otherwise follow `AI_PROVIDER` (mock development stays free).
- Scene request: roughly 1536×1024, quality configurable, no transparency.
- Character request: 1024×1024, PNG, transparent background, explicitly a 2×2 grid with consistent scale and baseline.
- Prompts use lesson title plus a bounded text excerpt (first ~1,200 characters of extracted pages). They ask for friendly, school-appropriate, flat/editorial illustration with no readable text, logos, brands, photorealistic people, or real-person likenesses. No student data ever enters the prompt.

### 4. Validate the sprite sheet strictly, then normalize frames

After download:

1. Verify dimensions are 1024×1024 (or the configured exact size), width equals height, and the PNG has an alpha channel.
2. Slice into four equal cells with ffmpeg `crop`.
3. Reject the visual if slicing or alpha validation fails; never guess a grid.
4. Build a 6-second loop at 30 fps as VP9 `yuva420p` WebM: neutral hold, blink, neutral hold, wave, neutral hold. If the alpha WebM encoder is unavailable, retry with a PNG-in-MOV alpha loop; if that also fails, mark the visual failed and use the standard video layout.

- **Why:** generated grids can be inconsistent; strict validation keeps a bad sheet from producing a broken overlay. VP9 alpha is compact and supported by the bundled ffmpeg; MOV/PNG is a safe fallback.
- Frames are normalized by using the same cell geometry for each pose. The prompt asks for consistent character placement; small imperfections are acceptable for a stylized loop.

### 5. Bob is applied at composition time; blink and wave come from the loop

The loop itself contains the pose sequence but no vertical motion. During segment composition, the looped character is overlaid at a sinusoidal vertical offset (`y = bottom - 10·sin(2πt/3)`), so the bob stays smooth within each slide and the loop never has to be re-rendered per duration.

- **Why:** baking bob into the loop would require the loop length to divide every slide duration, or produce a visible reset. Applying it in the per-segment filter graph is simpler and always continuous.

### 6. Side-panel composition with a fixed, readable slide box

Character-enhanced segments compose:

- Scene: scaled and center-cropped to 1920×1080.
- Slide: scaled to fit within 1280×960 without cropping, centered in that box at x=64, y=60 on an opaque white pad, so PDF text stays readable regardless of page aspect ratio.
- Character: scaled to about 480 px wide, bottom-aligned in the remaining right panel, overlaid with the bob offset.
- Audio: unchanged; segment duration remains narration plus the configured pause.

The poster is extracted from the first composed frame at t=0. When no current visual exists, the existing full-slide path remains unchanged except that its poster is also taken from the composed first segment for consistency.

- **Why:** the slide never overlaps the character, 4:3 and 16:9 pages both fit, and the scene remains visible in the frame and panel. A fixed composition is testable and avoids AI-generated layout decisions.
- **Alternative rejected:** corner overlay keeps the slide full-size but covers content; full-screen picture-in-picture is more cinematic but harder to keep readable and requires more layout tuning.

### 7. Failure isolation and lifecycle integration

`ensureLessonVisual` catches all generation, download, validation, and encoding errors, records `LessonVisual.status=FAILED` with a truncated reason and `GenerationJob(VISUAL).status=FAILED`, and returns a value render can ignore. Render then composes the standard video.

- Cancellation deletes `lessons/<id>/visual` and the `LessonVisual` row; lesson deletion already removes the prefix and cascades the row.
- The teacher-facing retry/regenerate path re-runs the pipeline with a new `jobVersion`, which naturally invalidates and regenerates art. No new endpoint is needed.
- Existing lessons are untouched until their next render/regeneration; they keep their current videos.

### 8. Configuration

Add `IMAGE_PROVIDER` (`openai|mock|disabled`, optional), `OPENAI_IMAGE_MODEL` (default `gpt-image-1`), and `OPENAI_IMAGE_QUALITY` (default `medium`). Validation requires `OPENAI_API_KEY` when the effective image provider is OpenAI.

- `disabled` behaves like a skipped visual without calling a provider.
- Mock fixtures live under `src/server/media/fixtures/` and are used by tests and mock-mode development.
- Document cost expectations in `docs/media.md`: two images per lesson version, not per page or locale.

### 9. Surface visual status in the existing teacher video card

`getLessonDetail` includes `LessonVisual`, and the video card shows a compact character badge: ready, unavailable with a short reason, or not generated. Student data and asset URLs are never exposed. The `GenerationJob` `VISUAL` badge already appears in the usage card.

- **Why:** the spec requires the failure reason to be observable, and the lesson detail page is where teachers already diagnose video variants. A separate art page would be disproportionate.
- **Alternative rejected:** showing artwork previews in admin; it requires new authenticated media routes and is not needed to explain a missing character.

## Risks / Trade-offs

- [Sprite sheets come back inconsistent or with an opaque background] → strict size/alpha validation, explicit grid prompt, and fallback to the standard video; mock fixtures keep the happy path testable.
- [Image generation is slow or rate-limited] → it runs at most once per lesson version, uses the existing render retry budget, and can be disabled; video still renders on failure.
- [VP9 alpha is missing in some ffmpeg builds] → try PNG-in-MOV alpha as a fallback, then standard layout; document the encoder requirement.
- [Generated art is off-topic or inappropriate] → prompts are grounded only in lesson text and constrained to school-appropriate, textless, non-photorealistic artwork; provider moderation failures fall back.
- [Character distracts from the lesson] → slide occupies the large left box and never overlaps the character; the right panel is visually separate.
- [Render time and disk use increase] → one extra 6-second loop per lesson, one scene PNG, and one sheet; per-segment overlay adds encoding work but no extra full-length assets.
- [Artwork from an old lesson version leaks into a new render] → `jobVersion` check on every render; stale rows are never used.
- [Regeneration races between locales] → both renders read the same `LessonVisual` row; only a mismatched version triggers generation, and the processor is idempotent.
- [Deployment without an OpenAI key] → image provider follows `AI_PROVIDER=mock` in development, and validation only requires a key for the effective OpenAI provider.

## Migration Plan

1. Add the Prisma enums/model and a migration (`LessonVisual`, `VisualStatus`, `VISUAL` job stage). No backfill is required; missing rows mean "no art yet."
2. Deploy code and env defaults. Existing lessons and videos continue to work; art is generated on the next render or regeneration.
3. To roll back, set `IMAGE_PROVIDER=disabled` first so no new image calls occur. Reverting the code leaves the extra table/enum value unused; drop them in a follow-up migration only after confirming no render depends on the visual path.
4. Re-render selected lessons if a consistent character look is required immediately after rollout.
