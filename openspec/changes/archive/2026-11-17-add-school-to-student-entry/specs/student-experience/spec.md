# Spec Delta

## ADDED Requirements

### Requirement: School at student entry

The system SHALL require a non-empty school name before a student starts a lesson, SHALL present the school field directly above the display-name field, and SHALL remember the submitted school for return visits.

#### Scenario: Enter a school and name

- **WHEN** a student opens a valid share link and submits a non-empty school and name
- **THEN** the system stores both for the student's session and opens the lesson

#### Scenario: School field placement

- **WHEN** the student entry form is shown
- **THEN** the school text field appears directly above the display-name field

#### Scenario: Empty school rejected

- **WHEN** the student submits a blank school
- **THEN** the system asks for a school and does not start the lesson

#### Scenario: Oversized school rejected

- **WHEN** the student submits a school longer than 120 characters
- **THEN** the system rejects the submission and asks for a school of up to 120 characters

#### Scenario: Returning student

- **WHEN** the same browser revisits the share link
- **THEN** the previously entered school is offered and can be confirmed or changed
