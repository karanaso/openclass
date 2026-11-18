# Spec Delta

## MODIFIED Requirements

### Requirement: Teacher lesson dashboard

The system SHALL show the teacher, for each lesson, the attempts with student name, school, mode, score, percentage, pass status, and completion time, plus attempt count, unique student count, average score, median score, pass rate, score-band distribution, questionnaire and game counts, and a per-student performance summary.

#### Scenario: View lesson results

- **WHEN** the teacher opens a lesson's results
- **THEN** the attempt list and aggregate summary reflect all stored attempts for that lesson

#### Scenario: School visible per attempt

- **WHEN** the teacher views the attempt list
- **THEN** each attempt shows the school stored with it

#### Scenario: Empty results

- **WHEN** no attempts exist for a lesson
- **THEN** the dashboard shows an empty state rather than zero-value statistics presented as real data

#### Scenario: Unique students counted

- **WHEN** a student has multiple completed attempts for the same lesson
- **THEN** the unique-student count includes that student once while the attempt count includes every completed attempt

#### Scenario: Score distribution shown

- **WHEN** completed attempts exist for a lesson
- **THEN** the dashboard shows how many attempts fall into each score band and keeps the bands ordered from lowest to highest

#### Scenario: Quiz and game breakdown

- **WHEN** a lesson has both questionnaire and game attempts
- **THEN** the dashboard shows the count for each mode separately alongside the combined totals

#### Scenario: Per-student performance summary

- **WHEN** the dashboard lists students for a lesson
- **THEN** each student's row shows their display name, number of completed attempts, best percentage, average percentage, and most recent completion time

#### Scenario: Incomplete attempts excluded

- **WHEN** an attempt has no completion timestamp
- **THEN** it is excluded from the lesson dashboard counts, distribution, and per-student summary
