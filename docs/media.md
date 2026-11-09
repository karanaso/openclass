# Speech and video

## Pipeline

```
teacher requests a locale → narration scripts → TTS per page → lesson visual set → ffmpeg slide segments → concat → MP4 + WebVTT + poster
```

Content generation finishes without queueing media. Video is generated on demand: the teacher chooses Generate or Recreate for a locale on the lesson detail page. Narration scripts are prepared first, then speech synthesis and rendering. A second locale can be queued the same way and reuses the prepared scripts.

## TTS

- `TTS_PROVIDER=openai` uses OpenAI speech synthesis.
- `TTS_PROVIDER=mock` generates a deterministic WAV tone for development and tests.
- Voices are configured with `OPENAI_TTS_VOICE_EL` and `OPENAI_TTS_VOICE_EN`.
- Model: `OPENAI_TTS_MODEL` (default `gpt-4o-mini-tts`).
- Audio is written under `lessons/<lessonId>/audio/<locale>/page-<n>.<ext>`.
- Duration is measured with `ffprobe` and stored on the narration segment.

## Lesson visuals

Each lesson can have one visual set:

- a structured art-direction brief generated from the lesson title and a bounded page-text excerpt by `OPENAI_ART_DIRECTION_MODEL` (defaults to `OPENAI_TEXT_MODEL`, normally `gpt-4.1-mini`), with a deterministic fallback when the text call fails,
- a 16:9 background scene relevant to the lesson topic,
- a transparent 1536×1024 PNG character sheet laid out as a 3×2 grid (neutral, blink, talk-closed, talk-open, wave, lean),
- a 6-second, 30 fps alpha animation loop built from the six poses, including a talking cycle.

The brief is stored on the lesson's visual row together with the model, image quality, prompt version, and generation id. It keeps the scene and character on the same lesson-specific concept. Both prompts consume the brief and the bounded excerpt; no student data is sent to the text or image provider.

Artwork uses `OPENAI_IMAGE_MODEL` (default `gpt-image-1`) at `OPENAI_IMAGE_QUALITY` (default `high`). `gpt-image-1-mini` is supported as an explicit cost-saving choice, but it is lower fidelity and is not the default. There is no OpenAI model named `gpt-4-mini`; `gpt-4.1-mini` is the text model used for the brief.

The scene and character are generated once per lesson version and reused for every slide and both language variants. A prompt-version change invalidates stale artwork on the next render; a model or quality change does not, so it never spends image credits without an explicit regeneration. `IMAGE_PROVIDER=disabled` turns the enhancement off.

The set is best-effort. If image generation, sprite validation, or loop encoding fails, the lesson and video still render in the original full-slide layout, and the teacher's lesson page shows why the character is unavailable. If a regeneration fails after a usable set exists, the previous artwork stays in use and the failure is recorded as `lastError`. Prompts forbid readable text, logos, real-person likenesses, and non-school-appropriate content.

The admin lesson page shows scene and character-sheet previews and a **Regenerate artwork** action. Regeneration queues only the `visual` stage: it regenerates the visual set and then re-renders any existing video variants with the same narration audio. It never regenerates cards, questions, or narration.

### Composition

Character-enhanced segments are 1920×1080:

- the scene is scaled to about 110% and panned slowly with a segment-specific direction, so the background never looks frozen,
- the slide is fitted inside a rounded 1280×960 card at (64, 60) without cropping, with a soft shadow, a short fade/drift entrance, and a vignette/panel treatment,
- the character is scaled to about 480 px wide in the right panel and animated with a gentle bob, breathing scale, and horizontal sway.

Blink, talking, wave, and lean come from the loop; bob, breathing, sway, and slide entrance are applied while composing each segment, so the loop never needs to match the slide duration. The poster is the first composed frame.

Visual assets are versioned by generation so a failed regeneration cannot destroy usable art:

```
lessons/<lessonId>/visual/<generationId>/scene.png
lessons/<lessonId>/visual/<generationId>/character-sheet.png
lessons/<lessonId>/visual/<generationId>/character-loop.webm   (or .mov when VP9 alpha is unavailable)
```

After a successful swap, the previous generation's files are deleted best-effort.

## Student ambience

The game and questionnaire share a looping background track at `public/audio/student-ambience.mp3`.

- The loop is generated locally from a synthetic I–V–vi–IV progression, so it has no third-party license or network dependency. Regenerate it with `./scripts/generate-ambience.sh`; the script writes a 32-second, mono, 96 kbps file through ffmpeg.
- It is served from the app origin at `/audio/student-ambience.mp3` and played at volume `0.16` under the game's sound effects.
- Audio starts only after a student interaction. Muting, shared by the game and questionnaire, stores `lessonlab:muted` in `localStorage` (`"1"` muted, `"0"` unmuted) and defaults to sound on when the key is absent.
- The ambient layer pauses while the tab is hidden and stops when a game or questionnaire session ends. A missing or blocked audio file leaves the activity fully usable and silent.

## Video

- Slide images come from Poppler `pdftoppm` at 150 DPI, scaled to 1920-wide and letterboxed to 1920×1080. Character-enhanced videos use the side-panel layout described above.
- Each slide is an H.264 segment with the narration audio and a 0.6 s pause.
- Segments are concatenated into an MP4 with AAC audio, `yuv420p`, and `+faststart` for seeking.
- Captions are generated as WebVTT from the narration script and measured timings.
- The poster is taken from the first composed frame.

Outputs:

```
lessons/<lessonId>/video/<locale>.mp4
lessons/<lessonId>/video/<locale>.vtt
lessons/<lessonId>/video/<locale>.jpg
```

## Limits and failure behavior

- `MAX_PDF_PAGES` bounds rendered pages.
- `MAX_VIDEO_SECONDS` bounds estimated duration.
- `VIDEO_RENDER_TIMEOUT_MS` bounds a single ffmpeg invocation.
- A free-disk guard skips rendering below 512 MB.
- A failed visual set does not fail the lesson or block video rendering; the video falls back to the full-slide layout.
- When a limit is hit, the video is marked `SKIPPED` with a reason and the lesson remains `READY`.
- A failed TTS or render marks the video `FAILED`; cards, quiz, and game remain available.
- Temporary render files are removed in a `finally` block.
- VP9 alpha loops are decoded with the `libvpx-vp9` decoder so transparency survives composition. If VP9 alpha encoding fails, a PNG-in-MOV loop is used.

## Configuration

```bash
TTS_PROVIDER=openai
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE_EL=alloy
OPENAI_TTS_VOICE_EN=alloy

# openai, mock, or disabled; defaults to AI_PROVIDER
IMAGE_PROVIDER=openai
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_QUALITY=high
# Defaults to OPENAI_TEXT_MODEL when unset.
OPENAI_ART_DIRECTION_MODEL=gpt-4.1-mini

MAX_PDF_PAGES=80
MAX_VIDEO_SECONDS=900
VIDEO_RENDER_TIMEOUT_MS=600000
```

Image generation costs one small text request (the art brief) plus two image requests per lesson version, not per page or locale; re-rendering a locale reuses the stored set. `high` quality costs more than `medium`; `gpt-image-1-mini` is cheaper but lower fidelity. `IMAGE_PROVIDER=mock` uses deterministic local fixtures and makes no network calls.

Changing a voice only affects speech and video. Re-run TTS or request a new variant; cards, questions, and attempts are never regenerated by media jobs.

## Troubleshooting

- `ffmpeg` or `pdftoppm` missing: install both in the worker image (the Dockerfile does).
- `moov atom not found` on playback: ensure `+faststart` is applied and the concat completed.
- Greek audio sounds wrong: change `OPENAI_TTS_VOICE_EL` and re-render the variant.
- Character missing: check the lesson's character badge and artwork panel for the visual failure reason. Set `IMAGE_PROVIDER=mock` to confirm the composition path, or use **Regenerate artwork** to retry generation without regenerating lesson content.
- Empty or misaligned character sheet: the art provider returned a blank cell or poses that disagree on scale/baseline. Regenerate artwork; if it repeats, lower the pose complexity or switch the image model. The video falls back to the standard layout rather than drawing a broken character.
- Artwork regeneration failed: the previous artwork stays in use. Check the last-error message in the artwork panel; cards, questions, narration, and attempts are untouched.
- Video render is slower after the visual upgrade: scene pan, slide entrance, and character breathing add per-frame encoding work. Keep `OPENAI_IMAGE_QUALITY` sensible, reduce `MAX_VIDEO_SECONDS`, or disable the image provider for low-power deployments.
- Character has a black rectangle: verify the worker's ffmpeg can decode VP9 alpha with `ffmpeg -decoders | grep libvpx-vp9`; the Docker image includes it.
- Video skipped for disk: free the media volume or reduce `MAX_VIDEO_SECONDS`.
