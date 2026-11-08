# questionnaire Specification

## Purpose

Assess each student with a source-grounded true/false and multiple-choice questionnaire that is graded on the server, resumable, and followed by clear feedback.

## Requirements

### Requirement: Questionnaire presentation

The system SHALL present all questionnaire items with their type, prompt, and options, and SHALL show the student's progress through the item count.

#### Scenario: Mixed item types

- **WHEN** a student opens the questionnaire
- **THEN** true/false items show two options and multiple-choice items show four options, each with exactly one selection

#### Scenario: Navigate and review

- **WHEN** the student moves between items before submitting
- **THEN** the system preserves answers and allows reviewing and changing any answer before submission

### Requirement: Answer key confidentiality

The system SHALL NOT include correct answers, answer indices, or explanations in questionnaire content delivered before submission.

#### Scenario: Pre-submission payload

- **WHEN** the client loads questionnaire items
- **THEN** the payload contains no field that identifies the correct option or explanation

### Requirement: Server-side grading

The system SHALL accept a submitted answer set, grade it on the server, and compute score, percentage, and pass status from the lesson's configured threshold.

#### Scenario: Grade a submission

- **WHEN** the student submits answers
- **THEN** the server records each response, returns the score and percentage, and marks the attempt passed or not passed against the configured threshold

#### Scenario: Incomplete submission

- **WHEN** the student submits with unanswered items
- **THEN** the system warns which items are unanswered and requires confirmation before grading the attempt

### Requirement: Attempt integrity

The system SHALL enforce at most one submitted questionnaire attempt per normalized student name per lesson unless the teacher enables retakes for that lesson.

#### Scenario: Second attempt blocked

- **WHEN** a name that already submitted reopens the questionnaire while retakes are disabled
- **THEN** the system shows the stored result and does not start a new attempt

#### Scenario: Retakes enabled

- **WHEN** the teacher enables retakes and the student submits again
- **THEN** the system stores a new attempt while preserving the earlier attempt

#### Scenario: Duplicate submit request

- **WHEN** the same submission is retried because of a network error
- **THEN** the system records one attempt and returns the same result

### Requirement: Post-submission feedback

The system SHALL show the score, pass status, per-item correctness, the correct answer, the explanation, and the source page after submission.

#### Scenario: Review graded result

- **WHEN** a student views a completed attempt
- **THEN** they see each item marked correct or incorrect with the correct answer and explanation

### Requirement: Draft autosave and resume

The system SHALL persist an in-progress questionnaire draft so a student can resume after a reload or lost connection.

#### Scenario: Resume draft

- **WHEN** the student returns to an unfinished questionnaire
- **THEN** previously selected answers are restored and the student resumes at an appropriate item

### Requirement: Accessible assessment experience

The system SHALL make every questionnaire control operable by keyboard and screen reader and SHALL present content in the student's selected locale.

#### Scenario: Keyboard-only completion

- **WHEN** the student navigates using only the keyboard
- **THEN** all options, navigation, and submission controls are reachable and operable

#### Scenario: Locale switch

- **WHEN** the student switches locale during the questionnaire
- **THEN** prompts and options are shown in the selected locale while selected answers are preserved

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
