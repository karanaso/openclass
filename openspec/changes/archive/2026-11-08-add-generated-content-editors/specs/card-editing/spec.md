# Spec Delta

## ADDED Requirements

### Requirement: Card editor opens from Generated content

The lesson detail view SHALL provide a card edit action next to the "Generated content" heading that shows the deck editor, and SHALL keep the editor hidden until the action is used.

#### Scenario: Edit action opens the deck editor

- **WHEN** a teacher activates the card edit action on the "Generated content" card
- **THEN** the deck editor becomes visible below the generated content summary

#### Scenario: Edit action hides the editor

- **WHEN** the deck editor is visible and the teacher activates the card edit action again
- **THEN** the deck editor is hidden without discarding the teacher's saved cards

#### Scenario: Editor shows regeneration warning

- **WHEN** the deck editor is opened
- **THEN** it states that regenerating the lesson replaces the deck and discards manual card edits

### Requirement: Teacher can create a deck card

The system SHALL allow an authenticated teacher to add a card to a ready lesson by supplying a source page and a non-blank Greek and English prompt and answer, and SHALL append the new card after the last card in the deck.

#### Scenario: Card created at the end of the deck

- **WHEN** the teacher submits a valid new card for a ready lesson
- **THEN** the system stores it with the next deck position and returns the saved card

#### Scenario: Bilingual content required

- **WHEN** the teacher submits a new card that omits either locale or has a prompt or answer that is empty or only whitespace
- **THEN** the system rejects the creation and stores no card

#### Scenario: Source page outside the lesson rejected

- **WHEN** the teacher submits a new card whose source page is not a page of the lesson
- **THEN** the system rejects the creation and stores no card

#### Scenario: Not-ready lesson rejected

- **WHEN** the teacher attempts to create a card for a lesson whose status is not ready
- **THEN** the system rejects the creation and leaves the deck unchanged

#### Scenario: Existing cards unaffected

- **WHEN** the teacher creates a card
- **THEN** every existing card keeps its position and content and the lesson's questions, narration, and videos remain unchanged
