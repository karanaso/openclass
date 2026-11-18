# Spec Delta

## ADDED Requirements

### Requirement: Home-screen access number entry

The system SHALL let a student enter a 9-digit lesson access number on the public home screen and SHALL redirect to that lesson's student entry screen when the number resolves.

#### Scenario: Enter a valid number

- **WHEN** a student types a 9-digit number that belongs to a lesson and submits it
- **THEN** the browser navigates to that lesson's student entry screen

#### Scenario: Invalid input is rejected before lookup

- **WHEN** the student submits a value that is empty or not exactly 9 digits
- **THEN** the system asks for a 9-digit number and performs no lookup

#### Scenario: Unknown number

- **WHEN** the student submits 9 digits that no lesson owns
- **THEN** the home screen shows a not-found message and stays on the home screen

#### Scenario: Number entry in either locale

- **WHEN** the home screen is shown in Greek or English
- **THEN** the number field, submit control, and result messages appear in that locale

### Requirement: Numeric student URL

The system SHALL accept a lesson access number anywhere the student share-link token is accepted for a lesson, so a numeric URL such as `/<locale>/s/<9 digits>` opens the same student entry flow as a lesson share link.

#### Scenario: Open a numeric URL

- **WHEN** a student opens `/<locale>/s/<9 digits>` for a valid number
- **THEN** the name and school entry screen is shown for that lesson

#### Scenario: Continue to the lesson

- **WHEN** the student submits a valid school and name from a numeric URL
- **THEN** the lesson opens on its PDF tab, or its first available content tab, and the lesson's own tabs and content are available

#### Scenario: Numeric URL for an unknown number

- **WHEN** a student opens a numeric URL whose number no lesson owns
- **THEN** the system shows the invalid-number message and no lesson content or class list

#### Scenario: Existing share links unaffected

- **WHEN** a student opens a class or lesson share URL that uses a token
- **THEN** the existing token behavior, including expiry and revocation, is unchanged

### Requirement: Access-code student identity flow

The system SHALL apply the existing name and school requirements, return-visit memory, and student session behavior to lessons opened by access number.

#### Scenario: Name and school required

- **WHEN** a student reaches a lesson through its number without an existing session for that number
- **THEN** the student must submit a non-empty school and name before the lesson opens

#### Scenario: Returning student

- **WHEN** the same browser revisits the same numeric lesson URL
- **THEN** the previously entered school and name are offered and the lesson opens without re-entry when the session is still valid

#### Scenario: Session is scoped to the number

- **WHEN** a student with a session for one number opens a different number
- **THEN** the system asks for a name and school again instead of reusing the other lesson's access

### Requirement: Access-number lockout feedback

The system SHALL tell the student when access-number lookups are temporarily blocked and SHALL prevent further submissions until the 30-second lockout ends.

#### Scenario: Lockout message

- **WHEN** the student reaches the failed-lookup limit
- **THEN** the system shows a message that too many attempts were made and that a 30-second wait is required

#### Scenario: Submission disabled during lockout

- **WHEN** the lockout is active
- **THEN** the home-screen number form does not submit further lookups and indicates when it can be used again

#### Scenario: Lockout ends

- **WHEN** the 30-second lockout has elapsed
- **THEN** the form accepts a number again without requiring a page reload
