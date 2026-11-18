# Spec Delta

## MODIFIED Requirements

### Requirement: Lesson tabs

The system SHALL present the lesson as tabs for the source PDF, Cards, Resources, Game, Questionnaire, and Rubric in that order, SHALL select the PDF tab when the lesson opens, and SHALL show only modes that have published content, at least one approved resource, a retrievable source document, or a rubric.

#### Scenario: Available modes

- **WHEN** a published lesson has cards, approved resources, game, questionnaire content, and a rubric
- **THEN** the PDF, Cards, Resources, Game, Questionnaire, and Rubric tabs are usable and no separate Video tab is offered

#### Scenario: Resources follow Cards

- **WHEN** a lesson offers both Cards and Resources tabs
- **THEN** the Resources tab appears immediately after Cards and before Game, and opening it shows the approved resources

#### Scenario: No approved resources

- **WHEN** a lesson has only suggested or dismissed resources, or no resources at all
- **THEN** the Resources tab is not offered

#### Scenario: PDF opens first

- **WHEN** a student opens a READY lesson whose source document is available
- **THEN** the PDF tab is the first tab in the tab list and is the initially selected tab

#### Scenario: Lesson without source material

- **WHEN** a student opens a READY lesson whose source document cannot be retrieved
- **THEN** the PDF tab is not offered and the first available content tab is selected instead

#### Scenario: Direct tab link

- **WHEN** a student opens a URL that targets a specific tab, including the Resources tab or the Rubric tab
- **THEN** that tab opens after name entry without returning to the first tab

#### Scenario: Rubric follows Questionnaire

- **WHEN** a lesson offers both Questionnaire and Rubric tabs
- **THEN** the Rubric tab appears immediately after Questionnaire

#### Scenario: No rubric

- **WHEN** a lesson has no rubric criteria or performance levels
- **THEN** the Rubric tab is not offered

#### Scenario: Rubric without questionnaire

- **WHEN** a lesson has a rubric but no questionnaire content
- **THEN** the Rubric tab is still offered and appears after the last available content tab
