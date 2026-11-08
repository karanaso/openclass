# Speech and video

## Pipeline

```
narration segments → TTS per page → lesson visual set → ffmpeg slide segments → concat → MP4 + WebVTT + poster
```

The primary lesson locale is rendered automatically after content generation. A second locale can be queued from the lesson detail page.

## TTS

- `TTS_PROVIDER=openai` uses OpenAI speech synthesis.
- `TTS_PROVIDER=mock` generates a deterministic WAV tone for development and tests.
- Voices are configured with `OPENAI_TTS_VOICE_EL` and `OPENAI_TTS_VOICE_EN`.
- Model: `OPENAI_TTS_MODEL` (default `gpt-4o-mini-tts`).
- Audio is written under `lessons/<lessonId>/audio/<locale>/page-<n>.<ext>`.
- Duration is measured with `ffprobe` and stored on the narration segment.

## Lesson visuals

Each lesson can have one visual set:

- a 16:9 background scene relevant to the lesson topic,
- a transparent 1024×1024 PNG character sheet laid out as a 2×2 grid (neutral, blink, wave, idle),
- a 6-second, 30 fps alpha animation loop built from the four poses.

The scene and character are generated once per lesson from the lesson title and a bounded page-text excerpt. The same set is reused for every slide and both language variants; regenerating the lesson invalidates it through the lesson's `jobVersion`. `IMAGE_PROVIDER=disabled` turns the enhancement off.

The set is best-effort. If image generation, sprite validation, or loop encoding fails, the lesson and video still render in the original full-slide layout, and the teacher's lesson page shows why the character is unavailable. No student data is sent to the image provider, and prompts forbid readable text, logos, real-person likenesses, and non-school-appropriate content.

### Composition

Character-enhanced segments are 1920×1080:

- the scene is scaled and center-cropped to fill the frame,
- the slide is fitted inside a 1280×960 box at (64, 60) without cropping, so text stays readable,
- the character is scaled to about 480 px wide in the right panel and overlaid with a gentle sinusoidal bob.

Blink and wave come from the loop; the bob is applied while composing each segment, so the loop never needs to match the slide duration. The poster is the first composed frame.

Visuals are stored with the rest of the private media:

```
lessons/<lessonId>/visual/scene.png
lessons/<lessonId>/visual/character-sheet.png
lessons/<lessonId>/visual/character-loop.webm   (or .mov when VP9 alpha is unavailable)
```

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
OPENAI_IMAGE_QUALITY=medium

MAX_PDF_PAGES=80
MAX_VIDEO_SECONDS=900
VIDEO_RENDER_TIMEOUT_MS=600000
```

Image generation costs two requests per lesson version (scene and character sheet), not per page or locale; re-rendering a locale reuses the stored set. `IMAGE_PROVIDER=mock` uses deterministic local fixtures and makes no network calls.

Changing a voice only affects speech and video. Re-run TTS or request a new variant; cards, questions, and attempts are never regenerated by media jobs.

## Troubleshooting

- `ffmpeg` or `pdftoppm` missing: install both in the worker image (the Dockerfile does).
- `moov atom not found` on playback: ensure `+faststart` is applied and the concat completed.
- Greek audio sounds wrong: change `OPENAI_TTS_VOICE_EL` and re-render the variant.
- Character missing: check the lesson's character badge for the visual failure reason. Set `IMAGE_PROVIDER=mock` to confirm the composition path, or regenerate the lesson to retry generation.
- Character has a black rectangle: verify the worker's ffmpeg can decode VP9 alpha with `ffmpeg -decoders | grep libvpx-vp9`; the Docker image includes it.
- Video skipped for disk: free the media volume or reduce `MAX_VIDEO_SECONDS`.
