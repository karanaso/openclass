# Spec Delta

## MODIFIED Requirements

### Requirement: Card editor opens from Generated content

The lesson detail view SHALL show the generated-content summary in one card and a separate edit actions card beside it, SHALL provide the card edit action in the edit actions card, and SHALL keep the deck editor hidden until the action is used.

#### Scenario: Summary and edit actions are separate cards

- **WHEN** a teacher opens the detail page of a lesson
- **THEN** the "Generated content" card shows only the generated-content summary and a separate "Edit content" card holds the card and question edit actions

#### Scenario: Edit action opens the deck editor

- **WHEN** a teacher activates the card edit action on the "Edit content" card
- **THEN** the deck editor becomes visible below the generated content summary and edit actions cards

#### Scenario: Edit action hides the editor

- **WHEN** the deck editor is visible and the teacher activates the card edit action again
- **THEN** the deck editor is hidden without discarding the teacher's saved cards

#### Scenario: Editor shows regeneration warning

- **WHEN** the deck editor is opened
- **THEN** it states that regenerating the lesson replaces the deck and discards manual card edits
