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

The system SHALL restrict every resource list, create, update, approve, dismiss, delete, and AI-suggestion request operation to an authenticated teacher and SHALL reject cross-origin mutations.

#### Scenario: Unauthenticated mutation

- **WHEN** an unauthenticated request attempts to add, edit, approve, dismiss, or delete a resource
- **THEN** the system denies the request and changes nothing

#### Scenario: Unauthenticated AI suggestion request

- **WHEN** an unauthenticated request attempts to generate AI resource proposals
- **THEN** the system denies the request and creates no resources

#### Scenario: Student cannot see suggestions

- **WHEN** a student loads a lesson through a share link
- **THEN** the response contains only approved resources for that lesson

### Requirement: Teacher-triggered AI resource proposals

The system SHALL offer an authenticated teacher a "Suggest games & videos" action on the lesson admin page that asks the AI for game and video resources based on the lesson's topics and extracted content, without regenerating cards, questions, or other lesson artifacts.

#### Scenario: Teacher requests proposals

- **WHEN** the teacher activates the suggestion action for a lesson
- **THEN** the system requests AI proposals and adds any valid results to the lesson's resource review queue

#### Scenario: Topics guide the request

- **WHEN** the lesson has topic keywords and the teacher requests proposals
- **THEN** the request uses those topics to ask for related games and videos

#### Scenario: No topics available

- **WHEN** the lesson has no topic keywords
- **THEN** the request uses the lesson title and extracted text instead and still completes or reports that there is not enough content

#### Scenario: Request in progress

- **WHEN** an AI proposal request is running
- **THEN** the teacher sees a progress state and cannot start a second request from the same action

#### Scenario: Not enough content

- **WHEN** the lesson has no extracted text, title, or topics to build a request from
- **THEN** the system rejects the request with an explanatory message and creates no resources

#### Scenario: AI request fails

- **WHEN** the AI proposal request fails or times out
- **THEN** the system reports the failure, creates no resources, and leaves the lesson and its existing resources unchanged

### Requirement: AI proposals await review

The system SHALL store AI-proposed resources with source `AI` and status `SUGGESTED`, SHALL NOT expose them to students until the teacher approves them, and SHALL let the teacher approve or dismiss them through the existing review actions.

#### Scenario: AI proposal is not published

- **WHEN** AI proposals exist for a lesson and the teacher has not approved them
- **THEN** the student Resources tab does not include those proposals

#### Scenario: Approve an AI proposal

- **WHEN** the teacher approves an AI-proposed resource
- **THEN** its status becomes `APPROVED` and it becomes visible to students on the next lesson load

#### Scenario: Dismiss an AI proposal

- **WHEN** the teacher dismisses an AI-proposed resource
- **THEN** it remains hidden from students and later AI or extraction runs do not suggest the same URL again

### Requirement: AI proposals are unverified

The system SHALL NOT fetch, resolve, live-search, or open AI-proposed URLs, SHALL validate only their syntactic form, and SHALL label AI proposals as AI-suggested and unverified in the teacher interface.

#### Scenario: No outbound request to a proposal

- **WHEN** the system stores an AI-proposed URL
- **THEN** it makes no network request to that destination and performs no live web search

#### Scenario: Unverified label

- **WHEN** the teacher views an AI proposal in the review queue
- **THEN** the resource is marked as AI-suggested and the teacher is prompted to verify it before approving

#### Scenario: Existing resources are unchanged

- **WHEN** AI proposals are generated for a lesson that already has resources
- **THEN** the existing resources, their statuses, and their positions remain unchanged

### Requirement: AI proposal validation

The system SHALL validate each AI proposal independently, SHALL discard a proposal whose title is missing, empty, or longer than 200 characters or whose URL is not a valid HTTP or HTTPS address within the URL length limit, SHALL keep the remaining valid proposals, and SHALL derive the resource kind and YouTube identity from the normalized URL.

#### Scenario: Mixed valid and invalid proposals

- **WHEN** an AI response contains some valid proposals and some with an invalid URL or missing title
- **THEN** the system stores the valid proposals and discards only the invalid ones

#### Scenario: YouTube proposal recognized

- **WHEN** an AI proposal uses a supported YouTube video URL
- **THEN** the resource is stored as a YouTube resource with the video identifier needed for the embedded player

#### Scenario: Oversized description

- **WHEN** an AI proposal includes a description longer than 500 characters
- **THEN** the system truncates the description to the limit instead of rejecting an otherwise valid proposal

### Requirement: AI proposal limits and deduplication

The system SHALL accept at most 8 AI proposals in one request, SHALL respect the existing per-lesson resource cap, and SHALL normalize and deduplicate proposed URLs against all existing resources in the lesson, including dismissed ones, without failing the request.

#### Scenario: More than eight proposals

- **WHEN** the AI returns more than 8 valid proposals in one request
- **THEN** the system stores at most 8 and ignores the remainder

#### Scenario: Duplicate proposal skipped

- **WHEN** an AI proposal normalizes to a URL already stored in the lesson
- **THEN** the system creates no duplicate resource and keeps the existing resource unchanged

#### Scenario: Per-lesson cap reached

- **WHEN** the lesson already has the maximum number of resources
- **THEN** the system stores no new proposals and reports that the lesson resource limit has been reached

#### Scenario: Repeated requests do not duplicate

- **WHEN** the teacher requests AI proposals more than once and the AI repeats a URL
- **THEN** at most one resource exists for that normalized URL

### Requirement: Suggested resource URL links

The system SHALL render the stored URL of every resource with status `SUGGESTED` in the teacher review queue as a link that opens in a new browsing context, and SHALL apply `noopener noreferrer` to that link so the destination cannot access the origin window.

#### Scenario: Suggested URL is activatable

- **WHEN** the teacher views a suggested resource in the lesson review queue
- **THEN** the displayed URL is a link to the resource's stored address

#### Scenario: Suggested URL opens in a new tab

- **WHEN** the teacher activates the URL link of a suggested resource
- **THEN** the destination opens in a new tab and the link carries `noopener noreferrer`

#### Scenario: Published rows unchanged

- **WHEN** a resource has status `APPROVED` and appears in the published section
- **THEN** it keeps its current presentation without the new suggestion navigation controls

### Requirement: Suggested resource Visit action

The system SHALL provide a Visit action on every suggested resource row that opens the resource's stored URL in a new tab, SHALL label the action in the active interface language, and SHALL give it an accessible name that includes the resource title.

#### Scenario: Visit opens the resource

- **WHEN** the teacher activates Visit on a suggested resource
- **THEN** the resource's stored URL opens in a new tab with `noopener noreferrer`

#### Scenario: Visit name identifies the resource

- **WHEN** a teacher using assistive technology focuses the Visit action of a suggested resource
- **THEN** the accessible name includes the resource title as well as the Visit label

#### Scenario: Visit label is localized

- **WHEN** the interface language is English or Greek
- **THEN** the Visit action uses the localized label for that language

#### Scenario: Navigation stays teacher-initiated

- **WHEN** the review queue renders suggested resources
- **THEN** the system makes no request to their destination URLs until the teacher activates a navigation control

#### Scenario: Review actions remain available

- **WHEN** a suggested resource shows the Visit action
- **THEN** its Approve, Dismiss, and Edit actions remain available and unchanged
