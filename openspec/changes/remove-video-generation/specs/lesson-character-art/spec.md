# Spec Delta

## REMOVED Requirements

### Requirement: Art-direction brief
**Reason**: Artwork exists only for video composition, so no art-direction brief is produced.

**Migration**: No replacement.

### Requirement: Artwork quality controls
**Reason**: No image model or quality is configured for lesson artwork.

**Migration**: No replacement.

### Requirement: Per-lesson visual set
**Reason**: No lesson scene, sprite sheet, or other visual set is generated.

**Migration**: No replacement.

### Requirement: Safe, content-appropriate artwork
**Reason**: No character or scene prompts are built.

**Migration**: Content safety rules for remaining AI requests remain under `lesson-generation`.

### Requirement: Sprite sheet validation and slicing
**Reason**: Sprite sheets and pose slicing are removed with character artwork.

**Migration**: No replacement.

### Requirement: Idle animation loop
**Reason**: No character animation or overlay is produced.

**Migration**: No replacement.

### Requirement: Visual set lifecycle
**Reason**: There is no visual set to generate, reuse, or replace.

**Migration**: No replacement.

### Requirement: Artwork preview and regeneration
**Reason**: The admin page no longer exposes or regenerates artwork.

**Migration**: No replacement.

### Requirement: Visual failure isolation
**Reason**: Visual generation no longer runs, so it cannot fail or report status.

**Migration**: No replacement.

### Requirement: Private artwork storage
**Reason**: Character and scene assets are no longer stored or served.

**Migration**: No replacement. Existing artwork files are purged by the cleanup script described in the change.
