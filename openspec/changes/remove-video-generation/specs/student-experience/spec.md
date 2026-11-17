# Spec Delta

## MODIFIED Requirements

### Requirement: Lesson tabs

The system SHALL present the lesson as tabs for the source PDF, Cards, Game, and Questionnaire in that order, SHALL select the PDF tab when the lesson opens, and SHALL show only modes that have published content or a retrievable source document.

#### Scenario: Available modes

- **WHEN** a published lesson has cards, game, and questionnaire content
- **THEN** the PDF, Cards, Game, and Questionnaire tabs are usable and no Video tab is offered

#### Scenario: PDF opens first

- **WHEN** a student opens a READY lesson whose source document is available
- **THEN** the PDF tab is the first tab in the tab list and is the initially selected tab

#### Scenario: Lesson without source material

- **WHEN** a student opens a READY lesson whose source document cannot be retrieved
- **THEN** the PDF tab is not offered and the first available content tab is selected instead

#### Scenario: Direct tab link

- **WHEN** a student opens a URL that targets a specific tab
- **THEN** that tab opens after name entry without returning to the first tab
