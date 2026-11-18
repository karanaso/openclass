# Spec Delta

## REMOVED Requirements

### Requirement: Manual video generation
**Reason**: The product no longer offers lesson video, so no teacher request or queued video work exists.

**Migration**: No replacement. Teachers and students use the PDF, cards, game, and questionnaire only.

### Requirement: Media status independent from lesson status
**Reason**: There is no per-locale video variant whose status could be tracked separately.

**Migration**: Lesson status continues to describe content generation only.

### Requirement: Language variants
**Reason**: Video variants are removed; localized content now covers text artifacts only.

**Migration**: Locale behavior for cards, questions, and the PDF remains under `localization`.

### Requirement: Video availability and failure isolation
**Reason**: With no video tab or video generation, there is no video state to isolate from the rest of the lesson.

**Migration**: Failure isolation for content generation remains under `lesson-generation`.

### Requirement: Video playback
**Reason**: The student application no longer streams video, captions, or posters.

**Migration**: No replacement. The student lesson view offers PDF, Cards, Game, and Quiz.

### Requirement: Video limits
**Reason**: No video is produced, downloaded, or size-limited.

**Migration**: The PDF upload and page-count limits remain under `lesson-ingestion`.

### Requirement: Private media handling
**Reason**: Video, caption, and poster storage and its private share-token route are removed.

**Migration**: Private PDF source access remains under `pdf-presentation`.

### Requirement: Teacher video variant preview
**Reason**: The admin lesson page no longer shows video variants or previews.

**Migration**: No replacement.

### Requirement: Teacher re-render a video variant
**Reason**: Teachers can no longer request, recreate, or refresh video renders.

**Migration**: No replacement.

### Requirement: Story-backed provider submission
**Reason**: No video provider is integrated, so no story-backed submission occurs.

**Migration**: No replacement. The retired `story-generation` capability is also removed.

### Requirement: Provider job lifecycle
**Reason**: Provider submission, polling, resumption, and terminal-state handling are deleted.

**Migration**: No replacement.

### Requirement: Provider output ingestion
**Reason**: No provider output is downloaded or validated because the provider integration is removed.

**Migration**: No replacement.

### Requirement: Duplicate provider submission prevention
**Reason**: Without provider jobs there is nothing to deduplicate.

**Migration**: No replacement.

### Requirement: Provider outage isolation
**Reason**: The video provider is no longer configured or called.

**Migration**: No replacement.
