# Spec Delta

## MODIFIED Requirements

### Requirement: Questions editor opens from Generated content

The lesson detail view SHALL show the generated-content summary in one card and a separate edit actions card beside it, SHALL provide the question edit action in the edit actions card, and SHALL present questionnaire and game questions as separate sections in the Questions editor.

#### Scenario: Summary and edit actions are separate cards

- **WHEN** a teacher opens the detail page of a lesson
- **THEN** the "Generated content" card shows only the generated-content summary and a separate "Edit content" card holds the card and question edit actions

#### Scenario: Edit action opens the Questions editor

- **WHEN** a teacher activates the question edit action on the "Edit content" card
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
