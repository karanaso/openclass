# Spec Delta

## Purpose

Assess each student with a source-grounded true/false and multiple-choice questionnaire that is graded on the server, resumable, and followed by clear feedback.

## ADDED Requirements

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
