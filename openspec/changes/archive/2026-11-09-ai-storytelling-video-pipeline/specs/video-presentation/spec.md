# Spec Delta

## MODIFIED Requirements

### Requirement: Manual video generation

The system SHALL start story preparation and video-provider work only when an authenticated teacher requests a video variant for a supported locale. Completing content generation SHALL NOT enqueue story or video-provider work.

#### Scenario: Content generation stops at READY

- **WHEN** content generation completes
- **THEN** the lesson is `READY` and no story or video-provider job is queued

#### Scenario: Teacher requests a variant

- **WHEN** the teacher chooses Generate for a locale
- **THEN** the system queues story preparation for that lesson variant

#### Scenario: Regeneration stays manual

- **WHEN** a lesson is retried or regenerated
- **THEN** video work still waits for a teacher request instead of starting automatically

### Requirement: Language variants

The system SHALL let the teacher request a video variant for either supported locale, and SHALL generate each requested variant independently using story narration prepared in that locale's language.

#### Scenario: Primary locale rendered

- **WHEN** the teacher requests a Greek video variant
- **THEN** the system prepares or reuses the story, submits the Greek narration to the provider, and exposes the Greek variant without requiring the other locale

#### Scenario: Additional locale requested

- **WHEN** the teacher requests an English variant for the same lesson
- **THEN** the system reuses the stored story, submits the English narration, and exposes both variants when available

### Requirement: Video availability and failure isolation

The system SHALL expose video status independently and SHALL keep cards, questionnaire, and game available when story preparation or video-provider generation fails.

#### Scenario: Video still rendering

- **WHEN** a lesson's text artifacts are ready but its video is still processing
- **THEN** students can use the other tabs and the video tab shows a processing state

#### Scenario: Video render failure

- **WHEN** story preparation or video-provider generation fails
- **THEN** the lesson remains usable, the video tab shows an unavailable state, and the teacher can retry generation

### Requirement: Video playback

The system SHALL stream provider-produced videos with seek support and SHALL expose a poster and captions when the provider supplies them. Captions SHALL be displayed for the requested locale.

#### Scenario: Seeking

- **WHEN** a student seeks within a video
- **THEN** playback resumes from the requested position using range requests

#### Scenario: Captions

- **WHEN** captions are enabled during playback and the provider supplied a WebVTT file
- **THEN** the lesson narration text for the current scene is displayed synchronized with the video

#### Scenario: Captions unavailable

- **WHEN** the provider did not supply a WebVTT file
- **THEN** the video still plays and the player does not request a missing captions track

#### Scenario: Poster unavailable

- **WHEN** the provider did not supply a poster
- **THEN** the video still plays without requesting a missing poster

### Requirement: Video limits

The system SHALL enforce configured limits on source page count, provider-reported duration, and downloaded output size, and SHALL report when a lesson cannot be produced within those limits.

#### Scenario: Lesson exceeds limits

- **WHEN** a PDF exceeds the configured page limit or the provider reports a duration above the configured maximum
- **THEN** the variant is skipped or stopped with a clear reason while the lesson's other artifacts remain available

#### Scenario: Output exceeds size limit

- **WHEN** a downloaded video or poster exceeds the configured output size limit
- **THEN** the system rejects that output and marks the variant failed with a clear reason

### Requirement: Private media handling

The system SHALL store provider media privately and SHALL serve it only to clients presenting a valid share token for the lesson.

#### Scenario: Media without token

- **WHEN** a client requests a video URL without a valid share token
- **THEN** the system denies access and returns no media

#### Scenario: Lesson deletion cleans media

- **WHEN** a lesson or its class is deleted
- **THEN** its videos, captions, posters, stories, and provider artifacts are removed from storage

### Requirement: Teacher re-render a video variant

The system SHALL let an authenticated teacher request a fresh provider render of a lesson's video variant for a supported locale, including when that variant is already `READY`, and SHALL limit the refresh to story reuse or regeneration and provider submission while preserving cards, questions, and attempts.

#### Scenario: Recreate a ready variant

- **WHEN** the teacher chooses Recreate next to a `READY` video variant
- **THEN** the system queues a new provider submission for that locale, shows the variant as processing, and leaves the other locale unchanged

#### Scenario: Recreate after a previous render completed

- **WHEN** the teacher requests Recreate for a variant whose earlier provider job is still retained by the queue
- **THEN** the system still starts a new submission instead of treating the request as a duplicate of the completed job

#### Scenario: Artwork is reused

- **WHEN** a variant is recreated and the current story has not been invalidated
- **THEN** the new submission uses the stored story instead of rewriting it

#### Scenario: Recreate while already processing

- **WHEN** a variant is pending or rendering
- **THEN** the system prevents another recreate request for that variant from starting duplicate work

#### Scenario: Recreate failure isolation

- **WHEN** a recreated variant fails
- **THEN** that variant reports its failure reason while the lesson's cards, questionnaire, game, and other locale remain available

#### Scenario: Unauthenticated recreate denied

- **WHEN** a client without a valid teacher session requests a re-render
- **THEN** the system denies the request and queues no work

## REMOVED Requirements

### Requirement: Narration preparation stage

**Reason**: Per-page narration scripts are replaced by one bilingual story with scene-level narration.

**Migration**: Use the story-generation capability; the teacher-triggered video request now prepares or reuses a story before provider submission.

### Requirement: Narration normalization and coverage

**Reason**: Story validation owns ordering, duplicate scenes, and locale coverage; per-page narration segments no longer exist.

**Migration**: Story validation rejects, orders, and repairs scenes before submission.

### Requirement: Targeted narration repair

**Reason**: Story repair replaces per-page narration repair.

**Migration**: The story stage makes at most one targeted repair request for missing or invalid scenes.

### Requirement: Narration failure isolation

**Reason**: Replaced by story and provider failure isolation on the requested video variant.

**Migration**: Retry the variant; a story or provider failure marks only that locale `FAILED` and leaves the lesson `READY`.

### Requirement: Automatic video rendering

**Reason**: LessonLab no longer renders slides, TTS audio, or local composition. An external AI video provider produces the video from the story.

**Migration**: Configure the video provider; the existing teacher Generate/Recreate actions now submit story-backed provider jobs.

### Requirement: Scene and slide motion

**Reason**: Visual composition and motion are owned by the video provider, not local ffmpeg rendering.

**Migration**: Provider output replaces local composition; no local scene or slide animation runs.

### Requirement: Character presence throughout the video

**Reason**: The local animated-character composition is retired from the video path.

**Migration**: Use the provider-rendered video; local character artwork is no longer required for playback.

### Requirement: Character motion polish

**Reason**: Local character animation is retired from the video path.

**Migration**: Provider output replaces local character animation.

### Requirement: Visual set reuse across language variants

**Reason**: Video variants no longer use a locally generated visual set for composition.

**Migration**: Each locale reuses the stored story and submits to the provider independently.

### Requirement: Visual enhancement failure isolation

**Reason**: Local artwork no longer gates or enhances video rendering.

**Migration**: Provider generation is independent of the legacy artwork feature; provider failures are isolated to the requested variant.

## ADDED Requirements

### Requirement: Story-backed provider submission

The system SHALL submit a video request only after a valid story exists for the lesson's current content version and the requested locale. The request SHALL contain the lesson title, the requested-locale scene narration, scene order, and page anchors, and SHALL NOT contain the raw PDF or student data.

#### Scenario: Missing story prepared first

- **WHEN** the teacher requests a video variant and no current story exists
- **THEN** the system prepares the story before submitting any provider job

#### Scenario: Stale story replaced

- **WHEN** content generation has published a new lesson version
- **THEN** the system regenerates the story before submitting the next provider job

#### Scenario: Requested locale only

- **WHEN** a Greek variant is submitted
- **THEN** the provider receives the Greek scene narration and locale, not a request for the other locale

#### Scenario: No student data

- **WHEN** a video provider request is constructed
- **THEN** it contains lesson content and instructions only, with no student identifiers, attempts, or results

### Requirement: Provider job lifecycle

The system SHALL submit each variant as a provider job, store the provider job identifier, and poll until a terminal state. In-progress states SHALL be exposed as `PENDING` or `RENDERING`, a completed job SHALL become `READY` only after successful ingestion, and a failed or timed-out job SHALL become `FAILED` with a readable reason.

#### Scenario: Submission recorded

- **WHEN** the provider accepts a video request
- **THEN** the system stores the provider job identifier and marks the variant `RENDERING`

#### Scenario: Progress observed

- **WHEN** the provider reports an in-progress state
- **THEN** the variant remains `RENDERING` and its progress or status detail is available to the teacher

#### Scenario: Completion requires ingestion

- **WHEN** the provider reports completion but the video has not been downloaded and verified
- **THEN** the variant is not marked `READY`

#### Scenario: Provider failure

- **WHEN** the provider reports a terminal failure
- **THEN** the variant is marked `FAILED` with the provider's reason

#### Scenario: Provider timeout

- **WHEN** polling exceeds the configured provider timeout
- **THEN** the variant is marked `FAILED` with a timeout reason and can be retried

#### Scenario: Worker restart

- **WHEN** the worker restarts while a provider job is in progress
- **THEN** polling resumes for that stored provider job instead of submitting a duplicate

### Requirement: Provider output ingestion

The system SHALL download the provider's video and store it under the lesson's per-locale video key. It SHALL store provider-supplied WebVTT captions and poster under the existing media keys, and SHALL verify that the downloaded video is non-empty, playable, within duration and size limits, and owned by the requested lesson before marking the variant `READY`.

#### Scenario: Successful ingestion

- **WHEN** the provider returns a valid completed video
- **THEN** the system stores the MP4, records its duration and size, and marks the variant `READY`

#### Scenario: Captions stored

- **WHEN** the provider returns a WebVTT file
- **THEN** the system stores it under the locale's captions key and exposes it to playback

#### Scenario: Poster stored

- **WHEN** the provider returns a poster image
- **THEN** the system stores it under the locale's poster key and exposes it to playback

#### Scenario: Invalid output rejected

- **WHEN** the downloaded video is empty, not playable, or fails the configured limits
- **THEN** the system does not mark the variant `READY` and records a clear failure reason

### Requirement: Duplicate provider submission prevention

The system SHALL allow at most one active provider job per lesson locale and SHALL use an idempotency key derived from the lesson, locale, and story version so repeated requests cannot start duplicate provider work.

#### Scenario: Duplicate request while processing

- **WHEN** the teacher requests a variant that is already `PENDING` or `RENDERING`
- **THEN** the system rejects the duplicate request without submitting another provider job

#### Scenario: Recreate after terminal state

- **WHEN** the teacher requests Recreate after the previous provider job reached a terminal state
- **THEN** the system submits a new job with a new idempotency key

#### Scenario: New content changes the key

- **WHEN** the lesson content version changes
- **THEN** the next submission uses an idempotency key for the new story version

### Requirement: Provider outage isolation

A video-provider outage, rate limit, or transport error SHALL affect only the requested variant. The system SHALL record an actionable reason and SHALL NOT change lesson status or remove previously available media.

#### Scenario: Provider unavailable

- **WHEN** the provider cannot be reached
- **THEN** the requested variant is `FAILED` with a provider-unavailable reason and the lesson remains `READY`

#### Scenario: Provider rate limit

- **WHEN** the provider rejects a submission because of a rate limit
- **THEN** the variant records the rate-limit reason and can be retried later

#### Scenario: Previous video preserved

- **WHEN** a recreate submission fails after an earlier variant was `READY`
- **THEN** the earlier video remains available until a new render is successfully ingested
