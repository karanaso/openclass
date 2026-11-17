# Spec Delta

## MODIFIED Requirements

### Requirement: Attempt persistence

The system SHALL store each questionnaire and game attempt with the student name, school, lesson, mode, selected answers, score, maximum score, pass status, duration, locale, and timestamps.

#### Scenario: Questionnaire attempt stored

- **WHEN** a questionnaire is submitted
- **THEN** one attempt record is stored with the graded answers and summary values

#### Scenario: Game attempt stored

- **WHEN** a game session ends
- **THEN** an attempt record is stored with the reached level, score, and answers given

#### Scenario: School captured from the session

- **WHEN** an attempt is created
- **THEN** it stores the school supplied at student entry for that session

#### Scenario: Autosaved draft is not an attempt

- **WHEN** a student abandons an unfinished questionnaire
- **THEN** the draft is retained for resume but no completed attempt or score is recorded

### Requirement: Teacher lesson dashboard

The system SHALL show the teacher, for each lesson, the attempts with student name, school, mode, score, percentage, pass status, and completion time, plus attempt count, average score, median score, and pass rate.

#### Scenario: View lesson results

- **WHEN** the teacher opens a lesson's results
- **THEN** the attempt list and aggregate summary reflect all stored attempts for that lesson

#### Scenario: School visible per attempt

- **WHEN** the teacher views the attempt list
- **THEN** each attempt shows the school stored with it

#### Scenario: Empty results

- **WHEN** no attempts exist for a lesson
- **THEN** the dashboard shows an empty state rather than zero-value statistics presented as real data

### Requirement: Result export

The system SHALL export a lesson's or class's results as a CSV file containing student name, school, mode, score, percentage, pass status, duration, and completion time.

#### Scenario: Export CSV

- **WHEN** the teacher exports results
- **THEN** the system downloads a CSV that opens correctly with spreadsheet software and includes all attempts in scope

#### Scenario: School exported

- **WHEN** the teacher exports lesson or class results
- **THEN** every row includes the school stored with that attempt

### Requirement: Minimal personal data

The system SHALL store only the display name and school supplied by the student and SHALL NOT collect email addresses, passwords, or device identifiers for assessment purposes.

#### Scenario: Stored student fields

- **WHEN** an attempt is persisted
- **THEN** the student-related data is limited to the provided display name, school, and the attempt's own answers and timestamps
