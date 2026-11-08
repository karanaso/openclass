# Spec Delta

## ADDED Requirements

### Requirement: Anonymized class statistics for students

The system SHALL compute class statistics for a lesson from completed questionnaire attempts in that lesson and SHALL return only aggregate values to a student: attempt count, average, highest, lowest, and score distribution.

#### Scenario: Same-lesson scope

- **WHEN** class statistics are requested for a lesson
- **THEN** only completed questionnaire attempts for that same lesson are included

#### Scenario: Incomplete attempts excluded

- **WHEN** an attempt has no completion timestamp
- **THEN** it is excluded from the class statistics

#### Scenario: Retakes counted

- **WHEN** a student has more than one completed attempt for the lesson
- **THEN** each completed attempt is counted in the statistics

#### Scenario: Small cohort suppressed

- **WHEN** fewer than three completed attempts exist for the lesson
- **THEN** no class statistics are returned and the student sees only their own result

#### Scenario: No identifying data

- **WHEN** class statistics are returned to a student
- **THEN** the payload contains no student names, individual attempt identifiers, normalized names, answers, or per-student scores

## MODIFIED Requirements

### Requirement: Result privacy and deletion

The system SHALL expose an attempt's individual result only to the teacher and to the student who created it, SHALL expose only aggregate non-identifying class statistics to a student, and SHALL let the teacher delete an individual attempt or all attempts for a lesson.

#### Scenario: Student sees only own result

- **WHEN** a student requests result data
- **THEN** the system returns only attempts tied to that student's current session and lesson, plus aggregated class statistics that identify no other student

#### Scenario: Teacher deletes attempt

- **WHEN** the teacher deletes an attempt
- **THEN** it is removed from lists, statistics, and exports and cannot be recovered
