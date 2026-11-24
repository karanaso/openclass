# Spec Delta

## ADDED Requirements

### Requirement: Suggested resource URL links

The system SHALL render the stored URL of every resource with status `SUGGESTED` in the teacher review queue as a link that opens in a new browsing context, and SHALL apply `noopener noreferrer` to that link so the destination cannot access the origin window.

#### Scenario: Suggested URL is activatable

- **WHEN** the teacher views a suggested resource in the lesson review queue
- **THEN** the displayed URL is a link to the resource's stored address

#### Scenario: Suggested URL opens in a new tab

- **WHEN** the teacher activates the URL link of a suggested resource
- **THEN** the destination opens in a new tab and the link carries `noopener noreferrer`

#### Scenario: Published rows unchanged

- **WHEN** a resource has status `APPROVED` and appears in the published section
- **THEN** it keeps its current presentation without the new suggestion navigation controls

### Requirement: Suggested resource Visit action

The system SHALL provide a Visit action on every suggested resource row that opens the resource's stored URL in a new tab, SHALL label the action in the active interface language, and SHALL give it an accessible name that includes the resource title.

#### Scenario: Visit opens the resource

- **WHEN** the teacher activates Visit on a suggested resource
- **THEN** the resource's stored URL opens in a new tab with `noopener noreferrer`

#### Scenario: Visit name identifies the resource

- **WHEN** a teacher using assistive technology focuses the Visit action of a suggested resource
- **THEN** the accessible name includes the resource title as well as the Visit label

#### Scenario: Visit label is localized

- **WHEN** the interface language is English or Greek
- **THEN** the Visit action uses the localized label for that language

#### Scenario: Navigation stays teacher-initiated

- **WHEN** the review queue renders suggested resources
- **THEN** the system makes no request to their destination URLs until the teacher activates a navigation control

#### Scenario: Review actions remain available

- **WHEN** a suggested resource shows the Visit action
- **THEN** its Approve, Dismiss, and Edit actions remain available and unchanged
