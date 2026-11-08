# Spec Delta

## ADDED Requirements

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
