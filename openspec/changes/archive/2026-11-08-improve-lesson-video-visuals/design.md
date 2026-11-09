# Design

## Context

See `proposal.md` for motivation and `specs/` for the behavior contract. The current implementation:

- `src/server/media/image-prompts.ts` builds two fixed prompts from the lesson title plus the first 1,200 characters of page text. `VISUAL_PROMPT_VERSION` is `v1`.
- `src/server/media/image.ts` calls `POST /v1/images/generations` with `OPENAI_IMAGE_MODEL` (default `gpt-image-1`) and `OPENAI_IMAGE_QUALITY` (default `medium`). The scene is `1536x1024`; the character sheet is `1024x1024` with a transparent background.
- `src/server/media/character.ts` assumes a 2×2 grid of 512 px cells (neutral, blink, wave, idle) and builds a ~6 s VP9-alpha loop.
- `src/server/media/render-video.ts` composes a fixed layout: scene center-cropped to 1920×1080, slide fitted into a 1280×960 box at (64, 60) on white, character 480 px wide on the right, and a sinusoidal bob. Segments are concatenated without transitions.
- `src/server/media/lesson-visual.ts` generates once per `jobVersion`, stores `scene.png`, `character-sheet.png`, and `character-loop.webm`, and only reuses art when `jobVersion` matches. A failed generation clears the keys and marks the row `FAILED`.
- `src/worker/processors/render.ts` calls `ensureLessonVisual` inline before composing. There is no way to regenerate art alone.
- `LessonVisual` stores status, `jobVersion`, keys, `model`, `promptVersion`, and `error`. `JobStage` already includes `VISUAL`, but the queue only exposes `extract|generate|tts|render`.

The worker already has ffmpeg/ffprobe and renders real media in tests. OpenAI text and image calls are both available through one API key.

## Goals / Non-Goals

**Goals:**

- Make artwork topic-specific, visually coherent, and higher fidelity without changing the lesson content pipeline.
- Make the character more expressive (talking, blinking, waving, leaning) and visually alive in the frame.
- Make the composition feel designed rather than a slide pasted next to a mascot.
- Let a teacher inspect artwork and refresh only artwork, with existing videos updated.
- Keep development and CI deterministic and free through mock providers and fixtures.

**Non-Goals:**

- Lip-sync tied to the audio waveform, emotion detection, or narration-driven gestures.
- Per-page or per-locale artwork generation.
- Teacher image upload, a full art editor, or choosing a character from a catalog.
- Changing PDF slide rendering, narration text, TTS voices, or lesson content generation.
- Regenerating cards/questions when artwork changes.

## Decisions

### 1. Generate a bounded art-direction brief before the image calls

Add `src/server/media/art-direction.ts` with an `ArtDirectionProvider` interface and OpenAI/mock implementations. It takes the same `{ title, pages }` input as the image prompts, reuses the bounded excerpt, and returns a small zod-validated object:

```ts
type ArtBrief = {
  subject: string;
  setting: string;
  mood: string;
  palette: string[];
  character: {
    role: string;
    form: string;      // non-human mascot species or object
    outfit: string;
    props: string[];
  };
  sceneComposition: string;
};
```

- **Model:** `OPENAI_ART_DIRECTION_MODEL`, defaulting to `OPENAI_TEXT_MODEL` (`gpt-4.1-mini`). This is the cheap text model the user asked about; `gpt-4-mini` is not a valid model name.
- **Why a brief instead of longer hard-coded prompts:** the scene and character need a shared, lesson-specific concept. A structured brief keeps both prompts aligned and makes the generated art inspectable. `gpt-4.1-mini` is inexpensive and already used for content generation.
- **Fallback:** if the text call fails, times out, or returns invalid JSON/schema, build a deterministic brief from the title and excerpt (subject = title, setting = a friendly illustrated environment inspired by the excerpt, a neutral palette, a simple non-human guide). Record `artBriefFallback=true`; do not fail the visual set.
- **Storage:** persist the brief as JSON on `LessonVisual` with the model name for observability. Never include student data.

### 2. Keep `gpt-image-1` and raise quality; make `gpt-image-1-mini` opt-in

- Default `OPENAI_IMAGE_MODEL` remains `gpt-image-1`; default `OPENAI_IMAGE_QUALITY` changes from `medium` to `high`.
- `gpt-image-1-mini` is documented and supported as a cost-saving choice, but not the default. The mini image model is faster/cheaper and visibly lower fidelity, so it would not address the quality complaint.
- The scene stays `1536x1024`. The character sheet moves to `1536x1024` with `background: "transparent"` and `output_format: "png"`, which accommodates the 3×2 grid at 512 px per cell.
- Prompt version becomes `v2`. Reuse requires `status=READY`, matching `jobVersion`, matching `promptVersion`, and existing files. A model/quality change alone does not invalidate art; the teacher can regenerate explicitly, avoiding surprise image spend after a config change.

### 3. Six-cell sheet and stricter validation

The sheet is 1536×1024 with six 512×512 cells:

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
| neutral | blink | talk-closed |
| talk-open | wave | lean |

`character.ts` constants change to `CHARACTER_SHEET_WIDTH=1536`, `CHARACTER_SHEET_HEIGHT=1024`, `CHARACTER_CELL_SIZE=512`, with a 3×2 pose layout.

Validation runs before slicing:

1. Exact dimensions, PNG, alpha channel (as today).
2. Each cell must have opaque alpha coverage between a lower and upper bound (for example 4%–70%), so blank or fully filled cells are rejected.
3. Character bounding-box width and height must be within ±15% of the median cell, and the bottom edge within ±5% of cell height, so poses agree on scale and baseline.

All thresholds live beside the constants and are covered by unit tests. A failed check marks the visual set failed (or keeps the previous art during a regeneration) and the video falls back to the standard layout.

- **Why 3×2:** six poses let the character mouth a talking cycle while keeping neutral, blink, wave, and lean. A single row of six would be too wide for the model; 2×3 is the closest supported aspect.
- **Alternative rejected:** generate separate images per pose and composite them. It multiplies image calls and does not guarantee consistency any better than one sheet.

### 4. One loop, richer sequence

`renderCharacterLoop` builds one ~7 s loop at 30 fps:

```
neutral 1.2s · blink 0.15 · neutral 0.5
talk-closed 0.25 · talk-open 0.25 · talk-closed 0.25 · talk-open 0.25
blink 0.15 · talk-closed 0.25 · talk-open 0.25
wave 1.2 · lean 0.8 · neutral 0.5
```

The loop repeats for the whole slide, so the character appears to speak while narration plays. The existing VP9-alpha / PNG-in-MOV fallback is unchanged.

### 5. Composition: scene pan, slide card, breathing character

Keep the fixed 1920×1080, 1280×960 slide box and 480 px character width. Extend `characterFilterGraph` into a variant-aware graph:

- **Scene motion:** scale the scene to ~110% and pan it with a `crop` expression driven by `t`; alternate pan direction by segment index. Pan is cheaper and more predictable than `zoompan` at 1080p. `zoompan` remains an alternative if pan alone looks flat.
- **Slide card:** overlay a pre-rendered rounded-corner alpha mask and a soft shadow asset under the slide, then fade the card in over ~0.35 s with a small upward drift.
- **Character:** apply time-based breathing scale (`eval=frame`), horizontal sway, and the existing bob. Keep the alpha format through every filter.
- **Vignette/panel:** overlay a static 1920×1080 RGBA asset that darkens the frame edges and adds a subtle lighter panel behind the character. Static assets live under `src/server/media/assets/` and are checked in so rendering stays deterministic.
- **Poster:** still the first composed frame, so it matches the layout.

The full-slide fallback path is unchanged except that it also gets a subtle fade-in if that does not complicate the segment.

- **Why static overlays instead of runtime `geq`:** `geq` on 1280×960 at 30 fps is expensive; a checked-in mask/shadow is cheap and testable.
- **Alternative rejected:** crossfades between segments. They require re-encoding the concatenated stream and audio handling; a per-slide entrance gives most of the polish at lower risk.

### 6. Versioned artwork keys and non-destructive regeneration

Current generation clears keys before writing, so a failed regeneration destroys usable art. Change `generateVisual` to:

1. Create new asset keys under `lessons/<lessonId>/visual/<generationId>/...` (`generationId` = random UUID).
2. Generate the brief, scene, sheet, frames, and loop into those keys.
3. Only after everything succeeds, update `LessonVisual` with the new keys, brief, model, quality, prompt version, and `status=READY`.
4. Best-effort delete the previous generation's keys.

On failure:

- If a previous `READY` set exists, leave it untouched, keep `status=READY`, and record the failure on the `GenerationJob(VISUAL)` row plus a new `lastError` field on `LessonVisual`.
- If there is no previous set, mark `status=FAILED` as today.

This makes teacher-triggered regeneration safe and keeps existing videos playable while new art is generated.

### 7. A dedicated `visual` queue stage for artwork refresh

Add `visual` to `PipelineStage` and a worker processor `processVisual`:

1. Load the lesson and pages; reject cancelled lessons.
2. Call `ensureLessonVisual(..., { force: true })`.
3. If it succeeds, find `VideoAsset` rows that already have a rendered variant (statuses `READY`, `FAILED`, or `SKIPPED`) and enqueue `render` for each locale with a fresh `runId`. The render reuses the new READY art; narration audio already exists.
4. If it fails, leave existing videos untouched and surface the error.

A new `POST /api/admin/lessons/[lessonId]/visual` route guarded by `withAdmin({ mutation: true })` enqueues this stage. It returns `409` if the visual row is already `GENERATING`/`PENDING`. The queue job id includes a random `runId`, matching the pattern used for forced video re-renders.

- **Why a separate stage instead of reusing render:** a render job is per-locale and would regenerate art once and then re-render one locale. A visual job generates once and fans out to every existing variant, which is the intended teacher action.
- **Alternative rejected:** synchronously regenerate inside the API request. Image generation can take minutes and would hit request timeouts.

### 8. Admin preview and controls

Add `GET /api/admin/lessons/[lessonId]/visual/[kind]` (`scene|character`) using `withAdmin` and the existing private-storage streaming helper. The lesson detail video card gains:

- two thumbnails for the current scene and character sheet,
- a **Regenerate artwork** button with a pending state,
- the existing character status badge, plus the last regeneration error when present,
- Greek and English labels.

Preview images are served only through the authenticated route, never from `public/`. The preview `<img>` requests are cache-busted with the visual `updatedAt` value.

### 9. Configuration and documentation

Add:

```bash
OPENAI_ART_DIRECTION_MODEL=gpt-4.1-mini   # defaults to OPENAI_TEXT_MODEL
OPENAI_IMAGE_MODEL=gpt-image-1            # gpt-image-1-mini is opt-in, lower fidelity
OPENAI_IMAGE_QUALITY=high
```

Document the recommendation, the six-pose sheet, the visual-only regeneration action, the new cost profile (one small text call plus two images per lesson version), and troubleshooting for empty/misaligned cells and slow renders. Update `docs/media.md` and `docs/generation.md`.

## Risks / Trade-offs

- [Six-cell sheets are harder for the image model to keep consistent] → strict cell/scale/baseline validation, explicit grid prompt, and fallback to the standard video; mock fixture covers the happy path.
- [Ken Burns and breathing filters increase render time] → pan via `crop` rather than `zoompan`, keep `veryfast`, reuse one 7 s loop, and measure integration render time; motion can be reduced to scene-only if needed.
- [Static overlay assets go stale if the layout constants change] → keep assets next to `render-video.ts`, test the composed graph, and regenerate assets in the same change as any layout change.
- [Art-direction text call adds latency and cost] → one bounded call per lesson version, 30 s timeout, deterministic fallback, and a mock provider for development/CI.
- [Regeneration fans out to many video renders] → only locales that already have variants; jobs are queued through BullMQ and reuse existing audio; failures stay per-variant.
- [High image quality costs more] → documented and configurable; `medium` and `gpt-image-1-mini` remain available; art is generated at most once per lesson version.
- [Prompt-version invalidation can regenerate art after deploy] → only on the next render/regeneration; existing videos are untouched until then; operators can set `IMAGE_PROVIDER=disabled` to prevent new calls.
- [Versioned keys increase storage briefly] → old generation files are deleted best-effort after a successful swap.

## Migration Plan

1. Add the `LessonVisual` columns (`artBrief`, `artBriefModel`, `artBriefFallback`, `imageQuality`, `generationId`, `lastError`) and a Prisma migration. Existing rows stay valid; missing metadata is treated as an older generation.
2. Deploy the new code and env defaults. Existing videos keep playing; the next render sees `promptVersion=v1 != v2` and regenerates art with the new pipeline.
3. Re-render a small set of lessons to validate cost, render time, and visual quality before a wider rollout.
4. Rollback: set `IMAGE_PROVIDER=disabled` to stop image calls, or revert the code. The added columns and versioned keys are unused by older code; old code still reads `sceneKey`/`characterSheetKey`/`characterLoopKey`, which point at valid files.
5. To force the new look for a lesson immediately, use **Regenerate artwork** on its detail page.

## Open Questions

None. The model question is resolved: use `gpt-4.1-mini` for the brief and `gpt-image-1` at `high` for artwork; `gpt-4-mini` is not a valid model, and `gpt-image-1-mini` is an opt-in cost mode rather than the quality fix.
