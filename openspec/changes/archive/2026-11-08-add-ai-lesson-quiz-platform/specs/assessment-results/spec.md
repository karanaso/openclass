# Spec Delta

## Purpose

Persist every assessment attempt and give the teacher reliable per-lesson, per-student, and per-question insight without collecting unnecessary personal data.

## ADDED Requirements

### Requirement: Attempt persistence

The system SHALL store each questionnaire and game attempt with the student name, lesson, mode, selected answers, score, maximum score, pass status, duration, locale, and timestamps.

#### Scenario: Questionnaire attempt stored

- **WHEN** a questionnaire is submitted
- **THEN** one attempt record is stored with the graded answers and summary values

#### Scenario: Game attempt stored

- **WHEN** a game session ends
- **THEN** an attempt record is stored with the reached level, score, and answers given

#### Scenario: Autosaved draft is not an attempt

- **WHEN** a student abandons an unfinished questionnaire
- **THEN** the draft is retained for resume but no completed attempt or score is recorded

### Requirement: Teacher lesson dashboard

The system SHALL show the teacher, for each lesson, the attempts with student name, mode, score, percentage, pass status, and completion time, plus attempt count, average score, median score, and pass rate.

#### Scenario: View lesson results

- **WHEN** the teacher opens a lesson's results
- **THEN** the attempt list and aggregate summary reflect all stored attempts for that lesson

#### Scenario: Empty results

- **WHEN** no attempts exist for a lesson
- **THEN** the dashboard shows an empty state rather than zero-value statistics presented as real data

### Requirement: Per-question insight

The system SHALL show, for questionnaire attempts, how many students answered each item correctly and the distribution of selected options.

#### Scenario: Difficult question identified

- **WHEN** the teacher views question statistics
- **THEN** each item shows its correctness rate and option distribution, ordered so weak items are easy to find

### Requirement: Class-level summary

The system SHALL summarize results across all lessons in a class, including attempts per lesson and per-student averages.

#### Scenario: Class overview

- **WHEN** the teacher opens a class's results overview
- **THEN** the system shows per-lesson attempt counts and averages and each student's average across lessons

### Requirement: Result export

The system SHALL export a lesson's or class's results as a CSV file containing student name, mode, score, percentage, pass status, duration, and completion time.

#### Scenario: Export CSV

- **WHEN** the teacher exports results
- **THEN** the system downloads a CSV that opens correctly with spreadsheet software and includes all attempts in scope

### Requirement: Result privacy and deletion

The system SHALL expose an attempt only to the teacher and to the student who created it, and SHALL let the teacher delete an individual attempt or all attempts for a lesson.

#### Scenario: Student sees only own result

- **WHEN** a student requests result data
- **THEN** the system returns only attempts tied to that student's current session and lesson

#### Scenario: Teacher deletes attempt

- **WHEN** the teacher deletes an attempt
- **THEN** it is removed from lists, statistics, and exports and cannot be recovered

### Requirement: Minimal personal data

The system SHALL store only the display name supplied by the student and SHALL NOT collect email addresses, passwords, or device identifiers for assessment purposes.

#### Scenario: Stored student fields

- **WHEN** an attempt is persisted
- **THEN** the student-related data is limited to the provided display name and the attempt's own answers and timestamps
