# Spec Delta

## Purpose

Turns extracted lesson page text into one validated, bilingual, source-anchored story that a video provider can render into a narrated lesson video.

## ADDED Requirements

### Requirement: Story preparation from extracted pages

The system SHALL generate a lesson story only from successfully extracted page text. The story request SHALL include the lesson title, page-tagged source text, and the source locale, and SHALL NOT include student names, attempts, or results.

#### Scenario: Story requested after extraction

- **WHEN** a video variant is requested for a lesson whose pages have been extracted
- **THEN** story generation receives the lesson title and page-tagged text for the whole lesson

#### Scenario: Extraction incomplete

- **WHEN** a lesson has no usable extracted text
- **THEN** the system does not call the story provider and fails the requested video variant with a clear reason

#### Scenario: No student data

- **WHEN** a story request is constructed
- **THEN** it contains lesson content and instructions only, with no student identifiers or assessment records

### Requirement: Continuous narrative with ordered scenes

The story SHALL be one continuous narrative arc made of ordered scenes, not one independent script per page. Each scene SHALL carry Greek and English narration and at least one source page anchor.

#### Scenario: Story is a single arc

- **WHEN** the provider returns a story
- **THEN** the scenes form an ordered narrative whose opening, development, and closing belong to the same lesson topic

#### Scenario: Both locales present

- **WHEN** a story scene is stored
- **THEN** it contains non-empty Greek and English narration for that scene

#### Scenario: Scene order preserved

- **WHEN** the provider returns scenes out of order
- **THEN** the system orders them deterministically before storing and submitting the story

#### Scenario: Scene has no narration

- **WHEN** a returned scene is missing narration in either locale
- **THEN** the story is rejected or repaired before any video submission

### Requirement: Source-page grounding

Every story scene SHALL reference at least one page that exists in the lesson. The system SHALL discard or repair scenes whose page anchors are missing, duplicated, or outside the lesson.

#### Scenario: Valid page anchor

- **WHEN** a scene references a page that exists in the extracted lesson
- **THEN** the scene is kept with that page anchor

#### Scenario: Invalid page anchor

- **WHEN** a scene references a page that does not exist in the lesson
- **THEN** the system rejects that scene and attempts repair instead of storing an ungrounded scene

#### Scenario: Anchors are observable

- **WHEN** a story is stored
- **THEN** the teacher-facing story record identifies which pages each scene came from

### Requirement: Long-document story coverage

For a lesson whose page text exceeds a single provider request, the system SHALL draft story material in bounded chunks that preserve page markers and SHALL merge the drafts into one story that covers the lesson.

#### Scenario: Long PDF is chunked

- **WHEN** the lesson text exceeds the configured story input budget
- **THEN** the system processes page-tagged chunks instead of truncating the lesson

#### Scenario: Chunked story remains one arc

- **WHEN** chunk drafts are merged
- **THEN** the stored story is a single ordered narrative rather than concatenated per-chunk stories

#### Scenario: Page coverage survives merge

- **WHEN** a long lesson is merged into a story
- **THEN** every cited page still exists in the lesson and the story references pages from across the document

### Requirement: Story validation and repair

The system SHALL validate the story against its schema, scene order, locale completeness, page anchors, and configured scene limits before storing it. It SHALL retry transient failures and make at most one targeted repair request for invalid or missing scenes.

#### Scenario: Malformed story retried

- **WHEN** the provider returns malformed structured output
- **THEN** the attempt fails validation and is retried up to the configured limit

#### Scenario: Missing scenes repaired

- **WHEN** the first valid response omits required scenes or locale text
- **THEN** the system makes one targeted repair request for only the missing material

#### Scenario: Repair still invalid

- **WHEN** the story is still invalid after repair or the retry limit is reached
- **THEN** the system records the reason and fails only the requested video variant

#### Scenario: Scene limits enforced

- **WHEN** the provider returns fewer or more scenes than the configured story limits
- **THEN** the story is rejected or trimmed deterministically before storage

### Requirement: Story reuse and invalidation

The system SHALL store one current story per lesson content version, SHALL reuse it for both locales and for Recreate, and SHALL invalidate it when content generation publishes new content for the lesson.

#### Scenario: Second locale reuses story

- **WHEN** a video variant is requested for the other locale after a story exists
- **THEN** the system reuses the stored story without calling the story provider again

#### Scenario: Recreate reuses story

- **WHEN** the teacher recreates a video variant whose story is current
- **THEN** the system resubmits the stored story to the video provider without rewriting it

#### Scenario: New content invalidates story

- **WHEN** content generation publishes a new lesson version
- **THEN** the previous story is marked stale or removed so the next video request generates a new one

#### Scenario: Failed story can be retried

- **WHEN** story generation failed for a lesson
- **THEN** a new video request for that variant starts story generation again

### Requirement: Story failure isolation

A story failure SHALL be recorded on the story job and the requested video variant only. It SHALL NOT change the lesson status or make cards, questionnaire, game, attempts, or the other locale unavailable.

#### Scenario: Story failure does not fail lesson

- **WHEN** story generation fails after its retries
- **THEN** the requested video variant is `FAILED` and the lesson remains `READY`

#### Scenario: Other locale unaffected

- **WHEN** story generation fails while preparing one locale
- **THEN** the other locale's video variant and stored media are unchanged

#### Scenario: Teacher can retry

- **WHEN** the teacher requests the failed variant again
- **THEN** the system retries story generation and provider submission for that locale

### Requirement: Story usage records

The system SHALL record the story provider model, prompt version, token usage, estimated cost, attempts, and failure reason on the lesson's story generation job.

#### Scenario: Usage recorded on success

- **WHEN** story generation completes
- **THEN** its model, token counts, and estimated cost are stored with the lesson's generation usage

#### Scenario: Failure recorded

- **WHEN** story generation fails
- **THEN** the failure reason and attempts are recorded on the story job
