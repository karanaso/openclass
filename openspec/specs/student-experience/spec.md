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

### Requirement: Copy an existing share link

The system SHALL let an authenticated teacher copy the student URL of an existing share link from the class or lesson share-link list, without creating a new link or changing the link's token.

#### Scenario: Copy an active link

- **WHEN** the teacher views an active share link in the share-link list and chooses to copy it
- **THEN** the student URL for that same link is placed on the clipboard and the link remains valid

#### Scenario: Reload preserves copyability

- **WHEN** the teacher reloads the class or lesson admin page after creating a link
- **THEN** the existing link still offers copy and yields the same student URL

#### Scenario: Revoked or expired link

- **WHEN** a share link has been revoked or is past its expiry date
- **THEN** the system does not offer a working copy action for that link

#### Scenario: Link created before token retention

- **WHEN** the teacher views a share link whose URL is not recoverable
- **THEN** the system indicates that the URL is unavailable instead of copying an invalid link, and the teacher can still create a new link

### Requirement: Share link token confidentiality

The system SHALL expose a share link's raw token only to an authenticated teacher and SHALL continue to resolve student access by the token hash.

#### Scenario: Unauthenticated token access

- **WHEN** an unauthenticated request attempts to retrieve a share link's token
- **THEN** the system denies the request and returns no token

#### Scenario: Student access unchanged

- **WHEN** a student opens the copied URL
- **THEN** the system resolves the same share link and enforces its existing expiry and revocation rules

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

### Requirement: School at student entry

The system SHALL require a non-empty school name before a student starts a lesson, SHALL present the school field directly above the display-name field, and SHALL remember the submitted school for return visits.

#### Scenario: Enter a school and name

- **WHEN** a student opens a valid share link and submits a non-empty school and name
- **THEN** the system stores both for the student's session and opens the lesson

#### Scenario: School field placement

- **WHEN** the student entry form is shown
- **THEN** the school text field appears directly above the display-name field

#### Scenario: Empty school rejected

- **WHEN** the student submits a blank school
- **THEN** the system asks for a school and does not start the lesson

#### Scenario: Oversized school rejected

- **WHEN** the student submits a school longer than 120 characters
- **THEN** the system rejects the submission and asks for a school of up to 120 characters

#### Scenario: Returning student

- **WHEN** the same browser revisits the share link
- **THEN** the previously entered school is offered and can be confirmed or changed

### Requirement: Lesson tabs

The system SHALL present the lesson as tabs for the source PDF, Cards, Resources, Game, and Questionnaire in that order, SHALL select the PDF tab when the lesson opens, and SHALL show only modes that have published content, at least one approved resource, or a retrievable source document.

#### Scenario: Available modes

- **WHEN** a published lesson has cards, approved resources, game, and questionnaire content
- **THEN** the PDF, Cards, Resources, Game, and Questionnaire tabs are usable and no separate Video tab is offered

#### Scenario: Resources follow Cards

- **WHEN** a lesson offers both Cards and Resources tabs
- **THEN** the Resources tab appears immediately after Cards and before Game, and opening it shows the approved resources

#### Scenario: No approved resources

- **WHEN** a lesson has only suggested or dismissed resources, or no resources at all
- **THEN** the Resources tab is not offered

#### Scenario: PDF opens first

- **WHEN** a student opens a READY lesson whose source document is available
- **THEN** the PDF tab is the first tab in the tab list and is the initially selected tab

#### Scenario: Lesson without source material

- **WHEN** a student opens a READY lesson whose source document cannot be retrieved
- **THEN** the PDF tab is not offered and the first available content tab is selected instead

#### Scenario: Direct tab link

- **WHEN** a student opens a URL that targets a specific tab, including the Resources tab
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
