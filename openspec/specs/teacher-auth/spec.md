# teacher-auth Specification

## Purpose

Restrict every class, lesson, generation, and results action to an authenticated teacher whose credentials are configured through the deployment environment.

## Requirements

### Requirement: Environment-configured teacher login

The system SHALL authenticate the teacher against credentials supplied through environment variables and SHALL NOT require a database-backed account.

#### Scenario: Valid password

- **WHEN** the teacher submits the configured password on the login page
- **THEN** the system creates an authenticated session and redirects to the admin area

#### Scenario: Invalid password

- **WHEN** the teacher submits a password that does not match the configured credential
- **THEN** the system rejects the attempt with a generic error that does not reveal which part was wrong and does not create a session

#### Scenario: Missing configuration

- **WHEN** the required credential or session secret is absent at startup
- **THEN** the system reports a configuration error in server logs and refuses teacher login instead of accepting any password

### Requirement: Protected admin routes

The system SHALL require a valid teacher session for all admin pages and admin API endpoints, including class management, uploads, generation actions, share-link management, and results.

#### Scenario: Unauthenticated page request

- **WHEN** a request without a valid session targets an admin page
- **THEN** the system redirects to the login page and preserves the requested destination for after login

#### Scenario: Unauthenticated API request

- **WHEN** a request without a valid session targets an admin API endpoint
- **THEN** the system responds with HTTP 401 and no admin data

#### Scenario: Student token used on admin route

- **WHEN** a request carrying only a student share token targets an admin endpoint
- **THEN** the system treats it as unauthenticated and responds with HTTP 401

### Requirement: Session lifecycle

The system SHALL issue an HttpOnly, Secure, SameSite session cookie with a bounded lifetime, and SHALL invalidate the session on logout.

#### Scenario: Session expiry

- **WHEN** an admin request arrives with an expired or tampered session cookie
- **THEN** the system rejects it as unauthenticated and requires login again

#### Scenario: Logout

- **WHEN** the teacher selects logout
- **THEN** the system clears the session cookie and subsequent admin requests are unauthenticated

### Requirement: Login throttling

The system SHALL rate-limit failed teacher login attempts per client address and SHALL apply a temporary lockout after repeated failures.

#### Scenario: Repeated failures

- **WHEN** a client exceeds the configured number of failed login attempts within the configured window
- **THEN** further attempts are rejected with HTTP 429 and a retry-after indication until the window expires

#### Scenario: Successful login resets counter

- **WHEN** the teacher authenticates successfully before the failure threshold is reached
- **THEN** the failure counter for that client is cleared
