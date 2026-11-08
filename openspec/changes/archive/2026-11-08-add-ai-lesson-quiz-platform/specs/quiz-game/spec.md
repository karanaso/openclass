# Spec Delta

## Purpose

Deliver a Millionaire-style review game that keeps students engaged through animated questions, sound, lifelines, and a visible prize ladder while producing trustworthy assessment records.

## ADDED Requirements

### Requirement: Game session start

The system SHALL start a game session for a student and lesson with a question set ordered from easiest to hardest and a visible score ladder.

#### Scenario: Start a game

- **WHEN** a student with a recorded name opens the game tab and starts
- **THEN** the system creates a game attempt and shows the first question with four answer options and the ladder

#### Scenario: No published game set

- **WHEN** the lesson has no published game question set
- **THEN** the game tab shows an unavailable state and no session is created

### Requirement: Server-authoritative answers

The system SHALL deliver questions without correct answers and SHALL validate each submitted answer and calculate the score on the server.

#### Scenario: Answer payload omits correctness

- **WHEN** the client requests a game question
- **THEN** the response contains the question, options, and identifiers but no correct-option flag, explanation, or answer key

#### Scenario: Answer evaluated on server

- **WHEN** the student selects an option
- **THEN** the server records the response, determines correctness, updates the score, and returns the result

### Requirement: Game progression and scoring

The system SHALL advance the ladder after a correct answer, SHALL end the session after an incorrect answer, and SHALL record the reached level and total score.

#### Scenario: Correct answer advances

- **WHEN** the student answers correctly
- **THEN** the reached level increases, the score updates, and the next question is offered

#### Scenario: Incorrect answer ends the game

- **WHEN** the student answers incorrectly
- **THEN** the session ends, the correct option is revealed, and the attempt is stored with the reached level and score

#### Scenario: Completing the ladder

- **WHEN** the student answers the final question correctly
- **THEN** the game ends in a completed state with the maximum score

### Requirement: Lifelines

The system SHALL provide a 50:50 lifeline and an ask-the-audience lifeline, each usable once per session, with effects computed from the server-held answer key.

#### Scenario: Use 50:50

- **WHEN** the student activates 50:50
- **THEN** the server removes two incorrect options for the current question and marks the lifeline used for the rest of the session

#### Scenario: Use ask the audience

- **WHEN** the student activates ask the audience
- **THEN** the system shows a plausible audience distribution that favors but does not always guarantee the correct option, and marks the lifeline used

#### Scenario: Lifeline already used

- **WHEN** the student attempts to reuse a spent lifeline
- **THEN** the system rejects the action and the game state is unchanged

### Requirement: Animation and sound

The system SHALL animate question transitions and answer reveals and SHALL play sound effects for selection, correct, incorrect, and completion events, with a persistent mute control.

#### Scenario: Mute preference

- **WHEN** the student mutes sound
- **THEN** no further game sounds play and the preference remains muted on the next visit

#### Scenario: Reduced motion

- **WHEN** the student's device requests reduced motion
- **THEN** animated transitions are replaced with immediate state changes while all game information remains available

### Requirement: Session resume and expiry

The system SHALL allow an in-progress game to resume after a page reload and SHALL expire abandoned sessions after a configurable period.

#### Scenario: Reload mid-game

- **WHEN** the student reloads the page during an active session
- **THEN** the same question, score, and remaining lifelines are restored

#### Scenario: Expired session

- **WHEN** the student returns after the session expiry period
- **THEN** the old session cannot continue and the student is offered a new game

### Requirement: End-of-game review

The system SHALL show the final score, reached level, and a review of the questions the student answered, including the correct answers and explanations.

#### Scenario: Review answers

- **WHEN** the game ends
- **THEN** the student sees each answered question, their selection, the correct option, and the explanation

#### Scenario: Results scoped to the student

- **WHEN** a student views a game result
- **THEN** only that student's attempt is shown and no other student's answers or scores are exposed
