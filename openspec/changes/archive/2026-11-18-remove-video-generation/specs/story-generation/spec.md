# Spec Delta

## REMOVED Requirements

### Requirement: Story preparation from extracted pages
**Reason**: Stories exist only to supply video-provider narration.

**Migration**: No replacement. Content generation continues to use extracted page text for cards, questions, and the game.

### Requirement: Continuous narrative with ordered scenes
**Reason**: No lesson story or ordered scene model remains.

**Migration**: No replacement.

### Requirement: Source-page grounding
**Reason**: Story scenes and their page anchors are removed with the story model.

**Migration**: Source grounding for cards and questions remains under `lesson-generation`.

### Requirement: Long-document story coverage
**Reason**: No story drafting, chunking, or merging runs.

**Migration**: No replacement.

### Requirement: Story validation and repair
**Reason**: No story output is validated or repaired because the story provider is removed.

**Migration**: No replacement.

### Requirement: Story reuse and invalidation
**Reason**: There is no current story to reuse or invalidate when content is published.

**Migration**: No replacement.

### Requirement: Story failure isolation
**Reason**: Story failures cannot occur without story generation.

**Migration**: No replacement.

### Requirement: Story usage records
**Reason**: No story job exists to record model, token, or cost usage.

**Migration**: Usage records for remaining generation jobs remain under `lesson-generation`.
