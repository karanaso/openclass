# video-presentation Specification

## Purpose

Produce a narrated video for each lesson directly from its PDF pages, and let students play the available language variant with captions.

## Requirements

### Requirement: Manual video generation

The system SHALL start TTS and video rendering only when an authenticated teacher requests a video variant for a supported locale. Completing content generation SHALL NOT enqueue TTS or render work.

#### Scenario: Content generation stops at READY

- **WHEN** content generation completes
- **THEN** the lesson is `READY` and no TTS or render job is queued

#### Scenario: Teacher requests a variant

- **WHEN** the teacher chooses Generate for a locale
- **THEN** the system queues narration preparation for that locale

#### Scenario: Regeneration stays manual

- **WHEN** a lesson is retried or regenerated
- **THEN** video work still waits for a teacher request instead of starting automatically

### Requirement: Narration preparation stage

The system SHALL prepare narration scripts for every lesson page before synthesizing audio for a requested video variant. The stage SHALL reuse complete scripts, prepare missing scripts when needed, and store Greek and English variants together.

#### Scenario: Missing scripts prepared

- **WHEN** a video variant is requested and narration is missing
- **THEN** the narration stage prepares scripts for the missing pages before TTS starts

#### Scenario: Existing scripts reused

- **WHEN** a video variant is recreated and complete scripts exist
- **THEN** the stage reuses them without calling the narration provider again

#### Scenario: Both locales stored

- **WHEN** narration is prepared
- **THEN** both Greek and English scripts are stored for every prepared page

#### Scenario: Recreate with missing scripts

- **WHEN** Recreate is requested and scripts are missing
- **THEN** the narration stage prepares them before TTS starts

### Requirement: Narration normalization and coverage

The system SHALL normalize provider narration to one segment per requested page, discard out-of-scope segments, keep the longest duplicate, order segments by ascending page, and verify that every requested page has a segment before synthesis.

#### Scenario: Duplicate segments for the same page

- **WHEN** the provider returns multiple segments for one page
- **THEN** the system keeps the segment with the greatest combined Greek and English length and continues

#### Scenario: Segments outside the request

- **WHEN** the provider returns a segment for a page that was not requested
- **THEN** the system discards that segment

#### Scenario: Segments out of order

- **WHEN** the provider returns narration segments out of ascending page order
- **THEN** the system orders them by ascending page number before storing them

#### Scenario: Missing page detected

- **WHEN** normalization produces no segment for a requested page
- **THEN** the system records that page as missing and starts the targeted repair pass

#### Scenario: Normalization is observable

- **WHEN** normalization drops duplicate or out-of-scope segments
- **THEN** a structured warning records the count and affected page numbers

### Requirement: Targeted narration repair

If the first narration pass omits a page, the system SHALL make one targeted second request containing only the missing pages. It SHALL NOT repeat the full narration request for pages that already succeeded.

#### Scenario: Missing pages retried

- **WHEN** the first pass omits one or more pages
- **THEN** the system requests narration again for only those missing pages

#### Scenario: Complete first pass

- **WHEN** the first pass covers every requested page
- **THEN** the system does not make a repair request

#### Scenario: Repair still incomplete

- **WHEN** the targeted repair still omits a page
- **THEN** the system stops retrying and applies video-variant failure isolation

### Requirement: Narration failure isolation

If narration is still missing a page after targeted repair, the system SHALL mark only the requested locale's video variant `FAILED` with a reason and SHALL leave the lesson, cards, questionnaire, game, attempts, and other locale usable.

#### Scenario: Variant fails

- **WHEN** narration remains incomplete after repair
- **THEN** the requested locale's video variant is `FAILED` and the lesson stays `READY`

#### Scenario: Other locale unaffected

- **WHEN** one locale's narration fails
- **THEN** the other locale's video variant and status are unchanged

#### Scenario: Content unaffected

- **WHEN** narration fails
- **THEN** cards, questionnaire, game, and attempts remain available and unchanged

#### Scenario: Teacher can retry

- **WHEN** the teacher requests the failed variant again
- **THEN** the system retries narration preparation and rendering for that locale

### Requirement: Media status independent from lesson status

Manual video work SHALL leave the lesson status unchanged and SHALL report progress and failure on the per-locale video variant.

#### Scenario: Lesson stays READY

- **WHEN** a video variant enters `PENDING` or `RENDERING`
- **THEN** the lesson status remains `READY`

#### Scenario: Failure does not fail the lesson

- **WHEN** a video variant becomes `FAILED`
- **THEN** the lesson status remains `READY`

#### Scenario: Success does not change the lesson

- **WHEN** a video variant becomes `READY`
- **THEN** the lesson status remains that of its content

### Requirement: Automatic video rendering

The system SHALL render each PDF page as a slide, synthesize narration for that page, and compose the slides and audio into a single MP4 with H.264 video and AAC audio. When a lesson visual set is ready, the system SHALL compose a side-panel layout with a designed slide card on the left and the lesson scene and animated character alongside it; otherwise it SHALL compose the existing full-slide layout.

#### Scenario: Successful render

- **WHEN** a lesson with a valid narration script finishes processing
- **THEN** the system produces a playable MP4 whose slides follow the PDF page order and whose narration matches each slide

#### Scenario: Narration pacing

- **WHEN** a slide's narration audio is shorter or longer than a fixed display time
- **THEN** the slide remains visible for the full duration of its narration plus the configured pause

#### Scenario: Slides stay readable

- **WHEN** a video is composed with the scene and character panel
- **THEN** the full slide is visible without cropping and remains large enough to read its text

#### Scenario: Standard layout without artwork

- **WHEN** no ready visual set exists for the lesson
- **THEN** the video renders in the existing full-slide layout and remains playable

### Requirement: Scene and slide motion

The system SHALL add subtle motion to a character-enhanced video: a slow scene pan or zoom that varies across slides, an entrance animation when a new slide appears, and a designed slide card with a soft shadow and vignette. Motion SHALL remain gentle enough that slide text stays readable.

#### Scenario: Scene moves during a slide

- **WHEN** a character-enhanced slide plays
- **THEN** the background scene drifts or zooms slowly instead of remaining a frozen image

#### Scenario: Slide enters

- **WHEN** a new slide begins
- **THEN** the slide card fades or drifts into place over a short entrance animation

#### Scenario: Text stays readable

- **WHEN** scene motion and slide entrance are applied
- **THEN** the slide remains fully visible, unclipped, and readable for the slide's duration

### Requirement: Language variants

The system SHALL let the teacher request a video variant for either supported locale, and SHALL generate each requested variant independently using narration prepared in that locale's language.

#### Scenario: Primary locale rendered

- **WHEN** the teacher requests a Greek video variant
- **THEN** the system prepares narration, synthesizes Greek audio, and renders the Greek variant without requiring the other locale

#### Scenario: Additional locale requested

- **WHEN** the teacher requests an English variant for the same lesson
- **THEN** the system reuses prepared narration scripts, synthesizes English audio, and exposes both variants when available

### Requirement: Video availability and failure isolation

The system SHALL expose video status independently and SHALL keep cards, questionnaire, and game available when video rendering fails.

#### Scenario: Video still rendering

- **WHEN** a lesson's text artifacts are ready but its video is still rendering
- **THEN** students can use the other tabs and the video tab shows a rendering state

#### Scenario: Video render failure

- **WHEN** video rendering fails
- **THEN** the lesson remains usable, the video tab shows an unavailable state, and the teacher can retry rendering

### Requirement: Video playback

The system SHALL stream rendered videos with seek support, show a poster frame before playback, and provide captions derived from the narration script.

#### Scenario: Seeking

- **WHEN** a student seeks within a video
- **THEN** playback resumes from the requested position using range requests

#### Scenario: Captions

- **WHEN** captions are enabled during playback
- **THEN** the narration text for the current slide is displayed synchronized with the audio

### Requirement: Video limits

The system SHALL enforce configured limits on page count, rendered duration, and output size, and SHALL report when a lesson cannot be rendered within those limits.

#### Scenario: Lesson exceeds limits

- **WHEN** a PDF exceeds the configured page or duration limit
- **THEN** video rendering is skipped or stopped with a clear reason while the lesson's other artifacts remain available

### Requirement: Private media handling

The system SHALL store rendered media privately and SHALL serve it only to clients presenting a valid share token for the lesson.

#### Scenario: Media without token

- **WHEN** a client requests a video URL without a valid share token
- **THEN** the system denies access and returns no media

#### Scenario: Lesson deletion cleans media

- **WHEN** a lesson or its class is deleted
- **THEN** its rendered videos, audio, and frames are removed from storage

### Requirement: Character presence throughout the video

The system SHALL show the animated character on every slide of a character-enhanced video, playing a continuous talking and idle animation for the slide's full duration. The poster image SHALL show the same composed layout.

#### Scenario: Character on every slide

- **WHEN** a character-enhanced video plays
- **THEN** the character is visible on every slide from the first frame to the last

#### Scenario: Poster matches the video

- **WHEN** a student sees the video poster before playback
- **THEN** the poster shows the slide, scene, and character in the same layout as the first video frame

#### Scenario: Long slide

- **WHEN** a slide lasts longer than one animation loop
- **THEN** the character animation repeats smoothly for the entire slide

### Requirement: Character motion polish

The system SHALL animate the character with gentle vertical bob, breathing, and sway in addition to its pose loop, so the character never looks like a static pasted image.

#### Scenario: Continuous motion

- **WHEN** a character-enhanced video plays
- **THEN** the character's position and scale change smoothly and continuously across the slide

#### Scenario: Motion survives long slides

- **WHEN** a slide lasts longer than one animation loop
- **THEN** bob, breathing, and sway remain continuous without a visible reset

### Requirement: Visual set reuse across language variants

The system SHALL generate at most one visual set per lesson and SHALL use the same scene and character in every language variant of that lesson's video.

#### Scenario: Second locale reuses artwork

- **WHEN** the teacher requests the other language variant after a character-enhanced video exists
- **THEN** the new variant uses the stored visual set without generating new artwork

#### Scenario: One visual set per lesson

- **WHEN** a lesson has videos in both locales
- **THEN** both videos show the same scene and character design

### Requirement: Visual enhancement failure isolation

The system SHALL keep the video available in the standard layout when character or scene artwork is missing, invalid, or failed, and SHALL NOT fail the lesson because of the enhancement.

#### Scenario: Artwork generation failed

- **WHEN** visual generation failed for a lesson
- **THEN** the video still renders and plays in the full-slide layout

#### Scenario: Artwork unavailable during render

- **WHEN** a video render starts but the visual set is not ready
- **THEN** the render proceeds without the character instead of waiting indefinitely

#### Scenario: Failure reason retained

- **WHEN** a character-enhanced video falls back because of a visual failure
- **THEN** the recorded visual status retains the reason the character is absent

### Requirement: Teacher video variant preview

The system SHALL let an authenticated teacher preview any `READY` video variant from the lesson admin page without creating or using a student share link, and SHALL stream previews with seek support, poster, and captions.

#### Scenario: Preview a ready variant

- **WHEN** the teacher chooses Play next to a `READY` video variant
- **THEN** the admin page shows that locale's video with its poster and captions and allows seeking within it

#### Scenario: Preview unavailable before rendering succeeds

- **WHEN** a variant is missing, pending, rendering, failed, or skipped
- **THEN** the system does not offer a working Play action for that variant and requests no media for it

#### Scenario: Preview requires teacher authentication

- **WHEN** a client without a valid teacher session requests an admin video preview URL
- **THEN** the system denies the request and returns no media

#### Scenario: Rendered media missing from storage

- **WHEN** a variant is marked `READY` but its stored video cannot be read
- **THEN** the preview reports that the video is unavailable instead of breaking the lesson admin page

### Requirement: Teacher re-render a video variant

The system SHALL let an authenticated teacher request a fresh render of a lesson's video variant for a supported locale, including when that variant is already `READY`, and SHALL limit the refresh to narration and video while preserving cards, questions, and the lesson visual set.

#### Scenario: Recreate a ready variant

- **WHEN** the teacher chooses Recreate next to a `READY` video variant
- **THEN** the system queues a new render for that locale, shows the variant as processing, and leaves the other locale unchanged

#### Scenario: Recreate after a previous render completed

- **WHEN** the teacher requests Recreate for a variant whose earlier render job is still retained by the queue
- **THEN** the system still starts a new render instead of treating the request as a duplicate of the completed job

#### Scenario: Artwork is reused

- **WHEN** a character-enhanced variant is recreated
- **THEN** the new render reuses the lesson's existing visual set and generates no new artwork

#### Scenario: Recreate while already processing

- **WHEN** a variant is pending or rendering
- **THEN** the system prevents another recreate request for that variant from starting duplicate work

#### Scenario: Recreate failure isolation

- **WHEN** a recreated variant fails
- **THEN** that variant reports its failure reason while the lesson's cards, questionnaire, game, and other locale remain available

#### Scenario: Unauthenticated recreate denied

- **WHEN** a client without a valid teacher session requests a re-render
- **THEN** the system denies the request and queues no work
