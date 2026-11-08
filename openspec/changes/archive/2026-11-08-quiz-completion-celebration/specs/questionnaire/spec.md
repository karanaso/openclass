# Spec Delta

## ADDED Requirements

### Requirement: Completion celebration

The system SHALL play a celebratory animation when a questionnaire submission completes successfully, on every submission including retakes.

#### Scenario: Complete a submission

- **WHEN** the student submits the questionnaire and grading succeeds
- **THEN** a tada or confetti-style celebration animation plays over the result screen

#### Scenario: Reduced motion preference

- **WHEN** the student's device requests reduced motion
- **THEN** no moving particles or large motion play and the result appears immediately with a static celebratory acknowledgment

#### Scenario: Retake completes

- **WHEN** retakes are enabled and the student submits a new attempt
- **THEN** the celebration plays again for the new result

### Requirement: Class score comparison

After grading, the system SHALL show the student's score alongside anonymized scores from other completed questionnaire attempts for the same lesson, including the number of attempts, class average, highest and lowest scores, and a score distribution.

#### Scenario: Class summary shown

- **WHEN** a student views a graded questionnaire result
- **THEN** the result shows their score with the class attempt count, average, highest, lowest, and the student's position in the distribution

#### Scenario: Small class cohort

- **WHEN** fewer than three completed questionnaire attempts exist for the lesson
- **THEN** the system shows a not-enough-results state instead of class statistics

#### Scenario: Revisit a completed result

- **WHEN** a student reopens a previously completed questionnaire result
- **THEN** the same class comparison is shown with current aggregate values

#### Scenario: Other students remain anonymous

- **WHEN** any class comparison is shown
- **THEN** it contains no student names, individual scores, answers, or other identifying information about another student

#### Scenario: Retakes included

- **WHEN** students have submitted more than one questionnaire attempt for the lesson
- **THEN** every completed attempt counts in the class summary and the class average is computed over attempts
