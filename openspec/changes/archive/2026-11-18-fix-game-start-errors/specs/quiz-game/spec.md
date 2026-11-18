# Spec Delta

## MODIFIED Requirements

### Requirement: Game session start

The system SHALL start a game session for a student and lesson with a question set ordered from easiest to hardest and a visible score ladder. When the session cannot start, the system SHALL state the specific cause and the recovery action instead of showing a generic unavailable-content message.

#### Scenario: Start a game

- **WHEN** a student with a recorded name opens the game tab and starts
- **THEN** the system creates a game attempt and shows the first question with four answer options and the ladder

#### Scenario: No published game set

- **WHEN** the lesson has no published game question set
- **THEN** the game tab reports that this lesson has no game yet and no session is created

#### Scenario: Student session no longer valid

- **WHEN** the start request is rejected because the student session is missing, expired, or no longer matches the share link
- **THEN** the game explains that the student must re-enter their name, offers one action back to the share link's name entry, and no session is created

#### Scenario: Lesson not ready

- **WHEN** the start request is rejected because the lesson is not currently published as ready
- **THEN** the game says the lesson is still being prepared, offers a retry, and rechecks the lesson's available content

#### Scenario: Unexpected start failure

- **WHEN** the start request fails because of a server error or a network failure
- **THEN** the game shows a retryable error that does not claim the content is missing, and the start action remains available

## ADDED Requirements

### Requirement: Accurate game request failures

The game interface SHALL report the actual reason a start, answer, or lifeline request failed and SHALL NOT describe an expired session, a not-ready lesson, a missing game set, or a transient failure as unavailable content.

#### Scenario: Session expires during play

- **WHEN** an answer or lifeline request is rejected as unauthorized
- **THEN** the game shows the session-expired explanation with the re-entry action instead of the unavailable-content message

#### Scenario: Game already ended

- **WHEN** the server reports that the current game session has ended
- **THEN** the game shows the ended state or a new-game action rather than an error

#### Scenario: Failure does not advance the game

- **WHEN** any game request fails
- **THEN** the interface does not show a new question, score change, or lifeline result that the server did not report

### Requirement: Game tab reflects current availability

The lesson view SHALL stop presenting a startable game after the server reports that the lesson has no game set or is not currently ready, without requiring a manual page reload.

#### Scenario: No game set discovered on start

- **WHEN** a start attempt reports that the lesson has no game questions
- **THEN** the lesson view no longer offers the game tab and the student can continue with the remaining lesson modes

#### Scenario: Readiness failure is temporary

- **WHEN** a start attempt reports that the lesson is not ready and the student retries after it becomes ready
- **THEN** the game starts normally without a page reload
