# Spec Delta

## REMOVED Requirements

### Requirement: Content generation publishes without narration
**Reason**: Narration is no longer produced anywhere in the system, so a requirement that content generation exclude it has no behavior to constrain.

**Migration**: Content generation continues to publish only cards, questionnaire items, and game questions; the artifact set is specified under `lesson-generation`.

### Requirement: Content publication clears stale narration
**Reason**: Stories and narration rows are removed, so there is no stale story to invalidate on publication.

**Migration**: Publication continues to replace cards and questions atomically; regeneration behavior is specified under `lesson-generation`.
