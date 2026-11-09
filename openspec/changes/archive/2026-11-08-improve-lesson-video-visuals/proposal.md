# Proposal

## Why

The character-enhanced video is meant to make lessons more engaging, but in practice it often looks worse than the plain slide video: the background is generic, the mascot is crude and off-model across its poses, and the composition is static with hard cuts between slides. Teachers also cannot inspect the artwork or refresh it without regenerating the whole lesson, so bad output is hard to correct. This change overhauls the visual quality and the controls around it.

On the model question: there is no OpenAI model named `gpt-4-mini`. The closest options are `gpt-4.1-mini` (text) and `gpt-image-1-mini` (image). The recommendation is to use `gpt-4.1-mini` to write a structured art-direction brief, keep `gpt-image-1` at `high` quality for the final artwork, and expose `gpt-image-1-mini` only as an opt-in cost-saving mode, because the mini image model is cheaper and faster but lower fidelity and would not fix the quality complaint by itself.

## What Changes

- Add a bounded, schema-validated **art-direction brief** generated from the lesson title and text excerpt by the configured text model, with a deterministic fallback when the text call fails. The brief describes the subject, setting, mood, palette, character role/species/outfit, props, and composition, and drives both scene and character prompts.
- Replace the 2×2 four-pose sprite sheet with a **3×2 six-pose sheet** (neutral, blink, talk-closed, talk-open, wave, lean) so the character can mouth a talking cycle instead of only blinking and waving.
- Raise the default image quality from `medium` to `high`, keep the image model and quality configurable, and document `gpt-image-1-mini` as an explicit lower-cost option rather than the default.
- Improve video composition: slow scene motion (Ken Burns), character breathing/sway on top of the existing bob, slide entrance motion, a rounded slide card with shadow, a vignette/panel treatment, and a poster that matches the first composed frame.
- Validate sprite cells more strictly: every cell must contain opaque artwork, and cell bounding boxes must agree on scale and baseline within a tolerance. Invalid sheets fall back to the standard full-slide video.
- Add an authenticated **artwork preview** and **Regenerate artwork** action on the admin lesson page. Regeneration refreshes only the visual set and the existing video variants; it never regenerates cards, questions, or narration.
- Version prompts and record the art brief, image model, quality, and prompt version so a prompt upgrade invalidates stale artwork on the next render while both locales keep sharing one set.
- Keep all existing safety constraints: no student data in prompts, school-appropriate output, no readable text, logos, brands, or real-person likenesses.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `lesson-character-art`: adds art-direction generation, a six-pose character sheet, stronger cell validation, prompt/model versioning, and teacher-facing artwork preview plus visual-only regeneration.
- `video-presentation`: adds richer scene and character motion, an improved slide/panel composition, a matching poster, and the fallback behavior for new validation failures.

## Impact

- `prisma/schema.prisma`: extend `LessonVisual` with the art brief, text model, image quality, and generation metadata needed for preview and staleness checks.
- `src/server/media`: art-direction builder, updated image prompts and provider options, six-cell sprite slicing/validation, talking loop rendering, and the upgraded ffmpeg composition.
- `src/server/media/lesson-visual.ts`: persist and expose the brief and metadata, support a forced regeneration, and treat a prompt-version change as stale.
- `src/worker`, `src/server/queue.ts`: add a `visual` pipeline stage that regenerates artwork and then refreshes existing video variants without touching content generation.
- New authenticated admin media route and controls in `src/app/[locale]/admin/lessons/[lessonId]/` and `src/components/admin/`.
- `src/lib/env.ts`, `.env.example`, `docs/media.md`, `docs/generation.md`: new configuration defaults, model guidance, cost notes, and troubleshooting.
- `messages/en.json`, `messages/el.json`: labels for artwork preview, regeneration, and new visual states.
- Tests: prompt/brief unit coverage, sprite validation, composition graph, visual-only regeneration, and admin artwork authorization.
- Cost: one additional small text call per lesson version; `high` image quality costs more per image than `medium`; artwork regeneration re-renders videos but does not re-run content generation.
