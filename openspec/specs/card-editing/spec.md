# card-editing Specification

## Purpose

Let a teacher correct the prompt and answer text of individual published deck cards in both lesson locales, without regenerating the lesson or altering its other generated content.

## Requirements

### Requirement: Teacher-only card editing

The system SHALL allow only an authenticated teacher to read and update deck card content, and SHALL scope every update to a card that belongs to the lesson named in the request.

#### Scenario: Teacher edits a card

- **WHEN** an authenticated teacher saves new text for a card on a lesson they manage
- **THEN** the system accepts the update for that card

#### Scenario: Unauthenticated update rejected

- **WHEN** a request to update card content has no valid teacher session
- **THEN** the system rejects the request and leaves the card unchanged

#### Scenario: Card from another lesson rejected

- **WHEN** a request targets a card id that belongs to a different lesson
- **THEN** the system rejects the request and leaves both lessons unchanged

### Requirement: Deck editor lists published cards

The lesson detail view SHALL show every published card of the lesson with its position, Greek prompt and answer, and English prompt and answer so the teacher can choose a card to edit.

#### Scenario: Published deck is listed

- **WHEN** a teacher opens the detail page of a lesson with published cards
- **THEN** the editor lists each card in deck order with both locale variants of its prompt and answer

#### Scenario: No published deck

- **WHEN** a teacher opens a lesson that has no published cards
- **THEN** the editor shows a clear unavailable state instead of an empty form or an error

### Requirement: Bilingual card update is atomic and validated

The system SHALL require a non-blank prompt and answer for both the Greek and English variants in every card update, and SHALL store both locale variants together or store neither.

#### Scenario: Valid bilingual update

- **WHEN** the teacher submits a non-blank Greek prompt and answer together with a non-blank English prompt and answer
- **THEN** both locale variants of that card are updated and the saved text is returned

#### Scenario: Blank content rejected

- **WHEN** the teacher submits a prompt or answer that is empty or only whitespace in either locale
- **THEN** the system rejects the update with a validation message and no locale variant is changed

#### Scenario: Missing locale rejected

- **WHEN** the teacher submits an update that omits either the Greek or the English variant
- **THEN** the system rejects the update and no locale variant is changed

#### Scenario: Partial write prevented

- **WHEN** storing one locale variant fails while the other succeeds
- **THEN** neither variant retains the new text

### Requirement: Editing requires a published deck

The system SHALL accept card edits only while the lesson has a published deck and SHALL reject edits while the lesson is queued, processing, or failed.

#### Scenario: Processing lesson rejected

- **WHEN** the teacher attempts to save a card edit for a lesson whose status is not ready
- **THEN** the system rejects the update and leaves the deck unchanged

#### Scenario: Ready lesson accepted

- **WHEN** the teacher saves a valid card edit for a lesson whose deck is published
- **THEN** the system accepts the update

### Requirement: Edited cards reach students on next load

The system SHALL serve the saved prompt and answer to students the next time they load the lesson deck, without requiring regeneration or a new share link.

#### Scenario: Student sees updated text

- **WHEN** a teacher saves new text for a card and a student then loads the lesson deck in that card's locale
- **THEN** the student sees the teacher's saved prompt and answer for that card

#### Scenario: Other cards unaffected

- **WHEN** a teacher saves new text for one card
- **THEN** every other card in the deck keeps its existing position and content

### Requirement: Card edits do not change other artifacts

The system SHALL limit a card update to the card's prompt and answer text and SHALL NOT change the lesson's questions, narration, videos, or card order.

#### Scenario: Artifacts remain unchanged

- **WHEN** the teacher saves a card edit
- **THEN** the lesson's questionnaire, game, narration segments, videos, and card order remain unchanged

### Requirement: Regeneration does not preserve manual card edits

The system SHALL replace the entire deck when the teacher regenerates lesson content and SHALL NOT merge manually edited card text into the regenerated deck.

#### Scenario: Regeneration discards edits

- **WHEN** a successful regeneration publishes a new deck after cards were manually edited
- **THEN** the deck contains the newly generated card text rather than the manually edited text

#### Scenario: Teacher is warned before editing

- **WHEN** the teacher opens the card editor
- **THEN** the interface states that regenerating the lesson discards manual card edits
