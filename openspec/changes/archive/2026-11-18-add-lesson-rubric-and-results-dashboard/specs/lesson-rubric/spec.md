# Spec Delta

## Purpose

Give every lesson a bilingual, AI-generated assessment rubric that explains criteria and performance levels, can be curated by the teacher, and is shown to students as informational guidance.

## ADDED Requirements

### Requirement: Rubric generation during lesson generation

The system SHALL generate an assessment rubric for a lesson from its extracted text and generated questionnaire content during content generation, and SHALL store criteria and performance levels separately for Greek and English.

#### Scenario: Rubric generated with content

- **WHEN** content generation completes for a lesson with usable text and questionnaire items
- **THEN** the lesson has a Greek rubric and an English rubric containing criteria and performance levels

#### Scenario: Rubric aligned with the assessment

- **WHEN** the AI produces rubric criteria
- **THEN** each criterion reflects a skill, concept, or expectation assessed by the lesson's questionnaire rather than an unrelated topic

#### Scenario: No rubric produced

- **WHEN** the AI returns no usable rubric
- **THEN** generation still completes and the lesson has no rubric

#### Scenario: Bilingual rubric

- **WHEN** a rubric is generated
- **THEN** every criterion and performance level has a Greek form and an English form with the same meaning

### Requirement: Rubric structure and limits

The system SHALL store each rubric with 3 to 6 criteria and 3 to 4 performance levels, SHALL give each criterion and level a stable identifier, SHALL limit each localized title or label to 80 characters and each description to 500 characters, and SHALL prevent duplicate identifiers.

#### Scenario: Excess criteria discarded

- **WHEN** generation returns more than 6 criteria
- **THEN** the system keeps at most 6 and discards the remainder

#### Scenario: Excess levels discarded

- **WHEN** generation returns more than 4 performance levels
- **THEN** the system keeps at most 4 and discards the remainder

#### Scenario: Oversized text rejected

- **WHEN** a criterion title or level label exceeds 80 characters, or a description exceeds 500 characters
- **THEN** the system rejects that item without rejecting the remaining valid rubric content

#### Scenario: Duplicate identifier removed

- **WHEN** two criteria or two levels share the same identifier
- **THEN** the system keeps one and discards the duplicate

### Requirement: Teacher rubric editing

The system SHALL let an authenticated teacher view and replace a lesson's rubric from the lesson admin page, including adding and removing criteria and performance levels, without regenerating the lesson, and SHALL allow the rubric to be cleared.

#### Scenario: Edit and save a rubric

- **WHEN** the teacher changes criterion or level text, adds a criterion, or removes a level and saves
- **THEN** the saved rubric replaces the previous rubric and remains after a page reload

#### Scenario: Invalid rubric edit

- **WHEN** the teacher submits a rubric with an empty title, a duplicate identifier, too many criteria or levels, or text over the limits
- **THEN** the system rejects the save with a validation message and keeps the previously saved rubric

#### Scenario: Clear the rubric

- **WHEN** the teacher removes every criterion and level and saves
- **THEN** the lesson has no rubric and no error is raised

#### Scenario: Lesson without a rubric

- **WHEN** the teacher opens a lesson that has no rubric
- **THEN** the lesson admin page shows an empty rubric state with a way to add criteria and levels

### Requirement: Teacher edit preservation

The system SHALL preserve a teacher-edited rubric when the lesson is regenerated and SHALL replace an AI-generated rubric only while the teacher has not edited it.

#### Scenario: Regeneration keeps an edited rubric

- **WHEN** the teacher edits the rubric and later regenerates the lesson
- **THEN** the teacher's rubric remains unchanged

#### Scenario: Regeneration refreshes an untouched rubric

- **WHEN** the teacher has not edited the rubric and the lesson is regenerated
- **THEN** the newly generated rubric replaces the previous AI-generated rubric

### Requirement: Best-effort rubric generation

The system SHALL treat rubric generation as best-effort: a provider error, timeout, or invalid rubric response SHALL be logged and SHALL NOT fail lesson generation or prevent cards, questions, and the game from being published.

#### Scenario: Rubric provider fails

- **WHEN** the AI request for the rubric fails
- **THEN** the lesson continues generating its cards and questions and reaches its normal ready state

#### Scenario: Invalid rubric response discarded

- **WHEN** the AI returns malformed rubric data
- **THEN** the system discards that rubric data and continues without failing the lesson

### Requirement: Teacher-only rubric mutations

The system SHALL expose rubric edits only to authenticated teachers and SHALL reject cross-origin rubric mutations.

#### Scenario: Unauthenticated rubric update

- **WHEN** an unauthenticated request attempts to change a lesson rubric
- **THEN** the system denies the request and changes nothing

#### Scenario: Cross-origin rubric mutation

- **WHEN** a rubric update arrives from a different origin
- **THEN** the system rejects the request without changing the rubric

### Requirement: Student rubric presentation

The system SHALL show students a read-only rubric in their selected locale, SHALL label it as guidance about assessment expectations, and SHALL NOT change the quiz score, pass status, stored answers, or attempt records when displaying it.

#### Scenario: Localized rubric

- **WHEN** a student opens the Rubric tab in English
- **THEN** the criterion titles, descriptions, level labels, and level descriptions appear in English

#### Scenario: Missing content locale

- **WHEN** a rubric lacks the student's selected locale
- **THEN** the system shows the lesson's primary locale and indicates the fallback

#### Scenario: Informational only

- **WHEN** a student views the rubric after completing the quiz
- **THEN** no rubric levels are scored or stored and the existing quiz result remains the authoritative assessment outcome

#### Scenario: No identifying data

- **WHEN** the rubric is returned to a student
- **THEN** it contains no student names, attempts, answers, or per-student scores
