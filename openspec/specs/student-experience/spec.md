# student-experience Specification

## Purpose

Give students a frictionless, account-free way to reach a lesson through a share link, identify themselves by name, and move between the lesson's learning modes.

## Requirements

### Requirement: Share link generation

The system SHALL let the teacher create a share link for a class or for a single lesson using an unguessable token of at least 128 bits of entropy.

#### Scenario: Create a lesson link

- **WHEN** the teacher requests a share link for a lesson
- **THEN** the system returns a URL containing a new unguessable token and stores it against that lesson

#### Scenario: Class link

- **WHEN** the teacher shares a class link
- **THEN** the student sees the class's published lessons and can open any of them

### Requirement: Share link revocation and expiry

The system SHALL let the teacher revoke a share link immediately and SHALL support an optional expiry date.

#### Scenario: Revoked link

- **WHEN** a student opens a revoked token
- **THEN** the system denies access with a friendly message and exposes no lesson content

#### Scenario: Expired link

- **WHEN** a student opens a token past its expiry date
- **THEN** the system denies access and indicates that the link has expired

### Requirement: Name-only student entry

The system SHALL require a display name before a student starts a lesson and SHALL NOT require an account, email, or password.

#### Scenario: Enter a name

- **WHEN** a student opens a valid share link and submits a non-empty name
- **THEN** the system stores the name for that student's session and opens the lesson

#### Scenario: Empty name rejected

- **WHEN** the student submits a blank name
- **THEN** the system asks for a name and does not start the lesson

#### Scenario: Returning student

- **WHEN** the same browser revisits the same lesson link
- **THEN** the previously entered name is offered and can be confirmed or changed

### Requirement: Lesson tabs

The system SHALL present the lesson as tabs for Cards, Video, Game, and Questionnaire, and SHALL show only modes that have published content.

#### Scenario: Available modes

- **WHEN** a published lesson has cards, game, and questionnaire but no video
- **THEN** the Cards, Game, and Questionnaire tabs are usable and the Video tab is hidden or shown unavailable

#### Scenario: Direct tab link

- **WHEN** a student opens a URL that targets a specific tab
- **THEN** that tab opens after name entry without returning to the first tab

### Requirement: Locale selection and persistence

The system SHALL let students switch between Greek and English and SHALL persist the choice across tabs and return visits.

#### Scenario: Locale carried across tabs

- **WHEN** a student selects English on the cards tab and opens the questionnaire
- **THEN** the questionnaire appears in English

#### Scenario: Locale preference remembered

- **WHEN** the student returns to the same share link in the same browser
- **THEN** the previously selected locale is restored

### Requirement: Mobile and low-friction access

The system SHALL render the student experience responsively for phones and tablets and SHALL require no installation or app store download.

#### Scenario: Phone layout

- **WHEN** a student opens a lesson on a narrow screen
- **THEN** tabs, cards, game controls, and questionnaire items remain usable without horizontal scrolling
