# Spec Delta

## ADDED Requirements

### Requirement: Lesson title editing

The system SHALL let an authenticated teacher replace an existing lesson's title with trimmed, non-empty text of at most 200 characters, and SHALL show the updated title wherever the lesson is presented, including the student header above the Game tab.

#### Scenario: Rename a lesson

- **WHEN** the teacher saves a valid new title from the admin lesson view
- **THEN** the lesson's stored title is updated and the new title appears in the admin lesson list, the admin lesson detail page, and the student lesson header

#### Scenario: Blank title rejected

- **WHEN** the teacher submits a title containing only whitespace
- **THEN** the system rejects the request with a validation message and leaves the previous title unchanged

#### Scenario: Overlong title rejected

- **WHEN** the teacher submits a title longer than 200 characters
- **THEN** the system rejects the request with a validation message and leaves the previous title unchanged

#### Scenario: Original filename retained

- **WHEN** the teacher changes a lesson's title
- **THEN** the original PDF filename, stored file, and generated content remain unchanged

#### Scenario: Same title in both locales

- **WHEN** a student switches between Greek and English after the title is edited
- **THEN** the same edited title is shown in both locales

#### Scenario: Renaming an unknown lesson

- **WHEN** the teacher attempts to rename a lesson that does not exist
- **THEN** the system responds that the lesson was not found and changes no title

#### Scenario: Student cannot rename

- **WHEN** an unauthenticated or non-teacher client attempts to rename a lesson
- **THEN** the system denies the request and leaves the title unchanged
