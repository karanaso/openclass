# Spec Delta

## Purpose

Lets a teacher correct or add the questionnaire and game questions of a ready lesson in both locales without regenerating the lesson, while keeping recorded student attempts unchanged.

## ADDED Requirements

### Requirement: Teacher-only question editing

The system SHALL allow only an authenticated teacher to read and update question content, and SHALL scope every update to a question that belongs to the lesson named in the request.

#### Scenario: Teacher edits a question

- **WHEN** an authenticated teacher saves new content for a question on a lesson they manage
- **THEN** the system accepts the update for that question

#### Scenario: Unauthenticated update rejected

- **WHEN** a request to update question content has no valid teacher session
- **THEN** the system rejects the request and leaves the question unchanged

#### Scenario: Question from another lesson rejected

- **WHEN** a request targets a question id that belongs to a different lesson
- **THEN** the system rejects the request and leaves both lessons unchanged

### Requirement: Questions editor opens from Generated content

The lesson detail view SHALL provide a question edit action next to the "Generated content" heading that shows a Questions editor, with questionnaire questions and game questions presented as separate sections.

#### Scenario: Edit action opens the Questions editor

- **WHEN** a teacher activates the question edit action on the "Generated content" card
- **THEN** the Questions editor becomes visible

#### Scenario: Edit action hides the editor

- **WHEN** the Questions editor is visible and the teacher activates the question edit action again
- **THEN** the Questions editor is hidden without discarding the teacher's saved content

#### Scenario: Both question modes are available

- **WHEN** a teacher opens the Questions editor for a lesson that has questionnaire and game questions
- **THEN** both sets are presented as separate editable sections

#### Scenario: No questions state

- **WHEN** a teacher opens the Questions editor for a lesson with no questions in a mode
- **THEN** that section shows a clear empty state and still offers the action to add a question

### Requirement: Question editor lists editable content

The Questions editor SHALL show, for every question in a mode, its position, type, source page, Greek and English prompt, option texts, Greek and English explanation, and correct option so the teacher can choose a question to edit.

#### Scenario: Question content is listed

- **WHEN** a teacher opens the Questions editor for a mode with questions
- **THEN** each question shows both locale variants of its prompt, options, and explanation plus its type, source page, and correct option

#### Scenario: Questions are in order

- **WHEN** the Questions editor lists questions
- **THEN** they appear in ascending position order for that mode

### Requirement: Question update is atomic and validated

The system SHALL require a non-blank prompt and explanation in both locales, exactly two options for a true/false question and four for multiple choice, option ids aligned across locales, and the correct option id present in both option sets, and SHALL store both locale variants together or store neither.

#### Scenario: Valid bilingual update

- **WHEN** the teacher submits a complete, valid question in both locales
- **THEN** both locale variants and the correct option are saved and returned

#### Scenario: Blank content rejected

- **WHEN** the teacher submits a prompt, option, or explanation that is empty or only whitespace in either locale
- **THEN** the system rejects the update with a validation message and no locale variant is changed

#### Scenario: Wrong option count rejected

- **WHEN** the teacher submits a true/false question without exactly two options or a multiple-choice question without exactly four options in either locale
- **THEN** the system rejects the update and no locale variant is changed

#### Scenario: Misaligned option ids rejected

- **WHEN** the Greek and English option sets do not contain the same ids in the same order
- **THEN** the system rejects the update and no locale variant is changed

#### Scenario: Missing correct option rejected

- **WHEN** the correct option id is not present in both locale option sets
- **THEN** the system rejects the update and no locale variant is changed

#### Scenario: Partial write prevented

- **WHEN** storing one locale variant fails while the other succeeds
- **THEN** neither variant retains the new content

### Requirement: Question type and mode are fixed after creation

The system SHALL NOT change a question's type or mode through an update, and SHALL allow only its prompt, option texts, explanation, correct option, and source page to change.

#### Scenario: Type change rejected

- **WHEN** an update attempts to change a question from true/false to multiple choice or the reverse
- **THEN** the system rejects the update and keeps the stored type and content

#### Scenario: Mode change rejected

- **WHEN** an update attempts to move a question between the questionnaire and the game
- **THEN** the system rejects the update and keeps the question in its original mode

### Requirement: Teacher can create questionnaire and game questions

The system SHALL allow an authenticated teacher to add a question to either the questionnaire or the game by supplying a type, source page, correct option, and complete bilingual content, and SHALL append the new question after the last question in that mode.

#### Scenario: Questionnaire question created

- **WHEN** the teacher adds a valid question to the questionnaire
- **THEN** the question is stored with the next questionnaire position and appears in the questionnaire section

#### Scenario: Game question created

- **WHEN** the teacher adds a valid question to the game
- **THEN** the question is stored with the next game position and appears in the game section

#### Scenario: Invalid new question rejected

- **WHEN** the teacher submits a new question that omits a locale, has blank content, has the wrong option count, has misaligned option ids, or names a missing correct option
- **THEN** the system rejects the creation and stores no question

#### Scenario: Source page outside the lesson rejected

- **WHEN** the teacher submits a new or edited question whose source page is not a page of the lesson
- **THEN** the system rejects the update and stores no change

### Requirement: Editing requires a ready lesson

The system SHALL accept question edits and creations only while the lesson is ready, and SHALL reject them while the lesson is queued, extracting, generating, rendering, failed, or cancelled.

#### Scenario: Processing lesson rejected

- **WHEN** the teacher attempts to save or create a question for a lesson whose status is not ready
- **THEN** the system rejects the request and leaves the question set unchanged

#### Scenario: Ready lesson accepted

- **WHEN** the teacher saves or creates a valid question for a lesson whose status is ready
- **THEN** the system accepts the change

### Requirement: Question changes reach students on next load

The system SHALL serve saved and newly created question content to students the next time they load the questionnaire or game, without requiring regeneration or a new share link.

#### Scenario: Student sees updated question

- **WHEN** a teacher saves new content for a question and a student then loads that question's mode in that locale
- **THEN** the student sees the teacher's saved prompt, options, and explanation

#### Scenario: Student sees new question

- **WHEN** a teacher creates a question and a student then starts a new attempt in that mode
- **THEN** the new question is included in the attempt

#### Scenario: Other questions unaffected

- **WHEN** a teacher saves or creates one question
- **THEN** every other question keeps its existing position, type, and content

### Requirement: Question changes do not rewrite recorded attempts

The system SHALL NOT change the stored score, pass status, or selected answers of an existing attempt when a question is edited or created, and SHALL apply the changed content to later attempts.

#### Scenario: Recorded attempt is unchanged

- **WHEN** a teacher edits a question after students have submitted attempts
- **THEN** each existing attempt keeps its recorded score, pass status, and selected answers

#### Scenario: Later attempt uses changed content

- **WHEN** a student starts a new attempt after a question is edited or created
- **THEN** the attempt uses the changed question content and the current question set

### Requirement: Question edits do not change other artifacts

The system SHALL limit a question change to the question set and SHALL NOT change the lesson's cards, narration, videos, share links, or existing question positions.

#### Scenario: Other artifacts remain unchanged

- **WHEN** the teacher saves or creates a question
- **THEN** the lesson's cards, narration segments, videos, share links, and the order of other questions remain unchanged

### Requirement: Regeneration does not preserve manual question edits

The system SHALL replace the entire question set when the teacher regenerates lesson content and SHALL NOT merge manually edited or created questions into the regenerated set.

#### Scenario: Regeneration discards edits

- **WHEN** a successful regeneration publishes a new question set after questions were manually edited or created
- **THEN** the question set contains the newly generated questions rather than the manual changes

#### Scenario: Teacher is warned before editing

- **WHEN** the teacher opens the Questions editor
- **THEN** the interface states that regenerating the lesson discards manual question edits
