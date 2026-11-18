# lesson-resources Specification

## Purpose

Let teachers curate per-lesson links and YouTube videos, review candidates discovered in the source PDF, and control exactly which resources students can see.

## Requirements

### Requirement: Lesson resource records

The system SHALL store each resource against one lesson with a kind of `LINK` or `YOUTUBE`, a single shared title, an optional description, a URL, an optional source page, and a review status of `SUGGESTED`, `APPROVED`, or `DISMISSED`.

#### Scenario: General link stored

- **WHEN** the teacher saves a resource for an existing lesson with a valid HTTP or HTTPS URL that is not a YouTube URL
- **THEN** the resource is stored with kind `LINK` and becomes visible to students

#### Scenario: YouTube video stored

- **WHEN** the teacher saves a resource whose URL points to a supported YouTube video address
- **THEN** the resource is stored with kind `YOUTUBE` and the video identifier needed for the embedded player

#### Scenario: Invalid URL rejected

- **WHEN** the teacher submits a resource URL that is not an absolute HTTP or HTTPS address, contains embedded credentials, or exceeds the URL length limit
- **THEN** the system rejects the request with a validation message and stores no resource

### Requirement: Resource field limits

The system SHALL require a non-empty title of at most 200 characters, SHALL accept an optional description of at most 500 characters, and SHALL reject values that exceed those limits.

#### Scenario: Missing title

- **WHEN** the teacher submits a resource without a title
- **THEN** the system rejects the request and asks for a title

#### Scenario: Oversized description

- **WHEN** the teacher submits a description longer than 500 characters
- **THEN** the system rejects the request and explains the limit

### Requirement: Manual resource management

The system SHALL let an authenticated teacher add, edit, and delete resources on a lesson admin page without regenerating the lesson, and SHALL allow this for any existing lesson regardless of its processing status.

#### Scenario: Add a resource

- **WHEN** the teacher adds a title and URL on the lesson admin page
- **THEN** the new resource appears in the lesson's resource list and is available to students once the lesson is ready

#### Scenario: Edit a resource

- **WHEN** the teacher changes a resource title, description, or URL and saves
- **THEN** the updated values replace the previous values and are used in the student view

#### Scenario: Delete a resource

- **WHEN** the teacher deletes an approved or manual resource
- **THEN** the resource is removed from the lesson and no longer appears to students

### Requirement: Review queue for discovered resources

The system SHALL mark resources discovered from the source PDF as `SUGGESTED` and SHALL NOT expose them to students until the teacher approves them.

#### Scenario: Suggestion is not published

- **WHEN** resource discovery finds a candidate and the teacher has not approved it
- **THEN** the student Resources tab does not include that candidate

#### Scenario: Approve a suggestion

- **WHEN** the teacher approves a suggested resource
- **THEN** its status becomes `APPROVED` and it becomes visible to students on the next lesson load

#### Scenario: Dismiss a suggestion

- **WHEN** the teacher dismisses a suggested resource
- **THEN** its status becomes `DISMISSED`, it remains hidden from students, and later extraction runs do not suggest the same URL again

### Requirement: Editing does not change review status

The system SHALL preserve a resource's review status when its title, description, or URL is edited, and SHALL revalidate the edited URL before saving.

#### Scenario: Edit a suggestion before approval

- **WHEN** the teacher corrects a suggested resource's title and URL
- **THEN** the corrected values are saved while the resource remains `SUGGESTED` until approved

#### Scenario: Invalid edit preserves old values

- **WHEN** the teacher edits a resource to an invalid URL
- **THEN** the system rejects the change and keeps the previously saved values

### Requirement: YouTube URL recognition

The system SHALL recognize common YouTube video URL forms, including `youtube.com/watch`, `youtu.be`, `youtube.com/shorts`, and `youtube.com/embed`, and SHALL derive a canonical video identifier for embedding.

#### Scenario: Short link recognized

- **WHEN** a resource URL uses the `youtu.be` form with a video identifier
- **THEN** the resource is stored as a YouTube video with that identifier

#### Scenario: Non-video YouTube page

- **WHEN** a YouTube URL does not identify a single video, such as a channel or playlist page without a video identifier
- **THEN** the resource is stored as a general link or rejected as invalid rather than as an embeddable video

### Requirement: Duplicate resources prevented

The system SHALL prevent two resources in the same lesson from sharing the same normalized URL, including when one was previously dismissed.

#### Scenario: Manual duplicate rejected

- **WHEN** the teacher adds a URL equivalent to an existing resource in the same lesson
- **THEN** the system does not create a second resource and reports that the resource already exists

#### Scenario: Dismissed URL not recreated

- **WHEN** extraction later encounters a URL whose resource was dismissed
- **THEN** the system leaves the dismissed resource unchanged and creates no new suggestion

### Requirement: Teacher-only resource operations

The system SHALL restrict every resource list, create, update, approve, dismiss, and delete operation to an authenticated teacher and SHALL reject cross-origin mutations.

#### Scenario: Unauthenticated mutation

- **WHEN** an unauthenticated request attempts to add, edit, approve, dismiss, or delete a resource
- **THEN** the system denies the request and changes nothing

#### Scenario: Student cannot see suggestions

- **WHEN** a student loads a lesson through a share link
- **THEN** the response contains only approved resources for that lesson
