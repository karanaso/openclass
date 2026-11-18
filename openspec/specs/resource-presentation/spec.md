# resource-presentation Specification

## Purpose

Give students a single place inside the lesson to open teacher-approved links and watch YouTube videos in an embedded player, without leaving the lesson flow.

## Requirements

### Requirement: Approved resources only

The system SHALL show students only resources whose status is `APPROVED` for the lesson they opened, and SHALL never expose suggested or dismissed resources.

#### Scenario: Mixed resource set

- **WHEN** a lesson has approved, suggested, and dismissed resources
- **THEN** the student view lists only the approved resources

#### Scenario: No approved resources

- **WHEN** a lesson has no approved resources
- **THEN** the student interface offers no Resources content for that lesson

### Requirement: Resource listing

The system SHALL present approved resources in a stable order, showing each resource's title, its optional description, and a clear indication of whether it is a link or a video.

#### Scenario: List approved links

- **WHEN** the student opens the Resources tab for a lesson with approved resources
- **THEN** every approved resource appears with its title and description in the stored order

#### Scenario: Duplicate titles

- **WHEN** two approved resources share the same title
- **THEN** both are listed separately and remain distinguishable by their destination or kind

### Requirement: Embedded YouTube playback

The system SHALL play `YOUTUBE` resources inside the lesson using a privacy-enhanced YouTube embed, and SHALL provide a direct link to open the video on YouTube.

#### Scenario: Play a video

- **WHEN** the student selects a YouTube resource
- **THEN** the video player loads inside the lesson without navigating away and without autoplaying

#### Scenario: Player unavailable

- **WHEN** the embedded player cannot load
- **THEN** the student can still open the video through the direct YouTube link

### Requirement: External link behavior

The system SHALL open `LINK` resources in a new tab and SHALL use `noopener noreferrer` so the destination cannot access the lesson window.

#### Scenario: Open a link

- **WHEN** the student activates a general link resource
- **THEN** the destination opens in a new tab while the lesson stays open

#### Scenario: Unsafe URL already stored

- **WHEN** a stored resource URL is not an HTTP or HTTPS address
- **THEN** the system does not render it as an activatable link

### Requirement: Shared resource text across locales

The system SHALL display each resource's single title and description unchanged in both Greek and English views, while all surrounding interface labels follow the selected locale.

#### Scenario: Student switches language

- **WHEN** the student changes the interface locale while viewing resources
- **THEN** resource titles and descriptions stay the same and interface labels appear in the selected locale

### Requirement: Accessible and responsive resources

The system SHALL keep resource titles, descriptions, embeds, and controls usable on phones and tablets, SHALL provide accessible names for the embedded player and link actions, and SHALL not require horizontal scrolling.

#### Scenario: Phone layout

- **WHEN** the student views resources on a narrow screen
- **THEN** video embeds fit the available width and links remain tappable without horizontal scrolling

#### Scenario: Screen reader

- **WHEN** a screen reader reaches a video embed or an external link
- **THEN** it announces the resource title and the action it performs

### Requirement: Resources removed while viewing

The system SHALL handle a resource that is deleted or unapproved after the student page was loaded without breaking the rest of the lesson.

#### Scenario: Removed resource on refresh

- **WHEN** the student reloads after a resource was deleted
- **THEN** that resource no longer appears and the remaining approved resources still work
