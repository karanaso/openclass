# class-management Specification

## Purpose

Organize lessons into classes and give the teacher control over their names, order, visibility, and deletion lifecycle.

## Requirements

### Requirement: Class creation

The system SHALL let an authenticated teacher create a class with a required name and optional description and display color.

#### Scenario: Create a class

- **WHEN** the teacher submits a class name
- **THEN** the class is created, appears in the teacher's class list, and is immediately available for lesson uploads

#### Scenario: Empty name rejected

- **WHEN** the teacher submits a name containing only whitespace
- **THEN** the system rejects the request with a validation message and creates no class

### Requirement: Class editing and ordering

The system SHALL let the teacher rename a class, edit its description and color, and reorder classes; the chosen order SHALL persist across sessions.

#### Scenario: Rename and reorder

- **WHEN** the teacher renames a class and drags it to a new position
- **THEN** the new name and order are stored and shown on the next visit

### Requirement: Lesson membership

The system SHALL place every lesson in exactly one class and SHALL display a lesson only within its owning class.

#### Scenario: Lesson appears in its class only

- **WHEN** a lesson belongs to class A
- **THEN** it is listed in class A and does not appear in class B

#### Scenario: Views are scoped to one class

- **WHEN** the teacher opens a class
- **THEN** only that class's lessons, processing states, share links, and results are shown

### Requirement: Class deletion

The system SHALL require explicit confirmation before deleting a class, and deletion SHALL remove the class, its lessons, generated artifacts, uploaded files, attempts, and share links.

#### Scenario: Confirmed deletion cascades

- **WHEN** the teacher confirms deletion of a class containing lessons
- **THEN** the class and its dependent records, uploads, generated media, and attempts are removed, and storage cleanup is scheduled

#### Scenario: Deletion cancelled

- **WHEN** the teacher dismisses the confirmation
- **THEN** the class and its lessons remain unchanged

#### Scenario: Deletion during processing

- **WHEN** the teacher deletes a class while one of its lessons is processing
- **THEN** the system cancels or discards pending jobs for those lessons and no artifacts are published afterward

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
