# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Language variants

The system SHALL let the teacher request a video variant for either supported locale, and SHALL generate each requested variant independently using narration prepared in that locale's language.

#### Scenario: Primary locale rendered

- **WHEN** the teacher requests a Greek video variant
- **THEN** the system prepares narration, synthesizes Greek audio, and renders the Greek variant without requiring the other locale

#### Scenario: Additional locale requested

- **WHEN** the teacher requests an English variant for the same lesson
- **THEN** the system reuses prepared narration scripts, synthesizes English audio, and exposes both variants when available
