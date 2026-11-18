# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
