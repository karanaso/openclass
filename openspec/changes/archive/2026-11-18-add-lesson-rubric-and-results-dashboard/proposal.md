# Proposal

## Why

Students finish the quiz with a score but no explicit criteria or performance expectations that explain what the assessment measured. Teachers also have a basic lesson results page but lack a compact visual summary of how a lesson performed across students, modes, and score bands. This change adds an AI-generated, teacher-editable rubric after the quiz and enriches the existing per-lesson results dashboard.

## What Changes

- Generate a bilingual assessment rubric for every lesson during content generation, derived from the lesson text and generated assessment content.
- Store the rubric per lesson as assessment criteria plus performance levels, with bounded counts and lengths.
- Let the teacher view and edit the rubric, including both Greek and English variants, from the lesson admin page.
- Preserve teacher-edited rubrics when a lesson is regenerated and refresh unedited AI-generated rubrics.
- Add a student-facing Rubric tab positioned after Quiz, showing localized criteria and performance levels.
- Keep the rubric informational only: the quiz score, pass status, and stored attempts remain authoritative and unchanged.
- Enrich the existing teacher lesson results page with unique-student counts, quiz/game breakdown, score distribution, and a per-student performance summary.
- Reuse the existing results page and data model rather than adding a duplicate dashboard.
- Leave question-level statistics, CSV export, attempt deletion, and student result behavior unchanged.

## Capabilities

### New Capabilities

- `lesson-rubric`: AI-generated, bilingual, teacher-editable lesson rubrics, including generation, limits, regeneration behavior, teacher-only edits, and informational student presentation.

### Modified Capabilities

- `student-experience`: the lesson tab order adds a Rubric tab after Quiz and shows it only when a rubric exists.
- `assessment-results`: the teacher lesson dashboard gains visual distribution, mode, unique-student, and per-student summaries.

## Impact

- Database: add rubric storage and a teacher-edited marker to `Lesson`, with a Prisma migration.
- Generation: extend provider types, response schemas, prompts, mock and OpenAI providers, orchestration, and publication so rubric generation is best-effort and non-blocking.
- Student experience: localize the rubric into student lesson data and render a new tab component after Quiz.
- Teacher experience: add a rubric editor to the lesson admin page and supporting read/update APIs.
- Results: extend the lesson results service and page with score distribution, mode breakdown, unique students, and per-student performance.
- Tests and documentation: unit, integration, component, and e2e coverage plus README and generation/results documentation updates.
- No new runtime dependencies.
