# Spec Delta

## Purpose

Accept lesson PDFs from the teacher's browser, store them privately, and reliably queue them for content generation with visible processing status.

## ADDED Requirements

### Requirement: Bulk PDF upload

The system SHALL accept multiple PDF files in one upload, including files selected from a folder, and SHALL create one lesson per accepted file in the selected class.

#### Scenario: Multiple files uploaded

- **WHEN** the teacher selects five PDFs and confirms the upload to a class
- **THEN** the system reports five accepted files, creates five lesson records, and queues five processing jobs

#### Scenario: Partial acceptance

- **WHEN** the selection mixes valid PDFs with unsupported files
- **THEN** valid PDFs are accepted and queued, and each rejected file is reported by name with the rejection reason

### Requirement: Upload validation

The system SHALL validate each upload against the PDF media type, the configured maximum file size, and basic PDF structure before accepting it.

#### Scenario: Unsupported file rejected

- **WHEN** the teacher uploads a file that is not a PDF
- **THEN** the system rejects that file and creates no lesson for it

#### Scenario: Oversized file rejected

- **WHEN** a file exceeds the configured size limit
- **THEN** the system rejects it with a message stating the limit and creates no lesson for it

#### Scenario: Corrupt or encrypted PDF rejected

- **WHEN** a PDF cannot be parsed or is password-protected
- **THEN** the system marks the upload rejected with a clear reason and does not queue generation

### Requirement: Duplicate detection

The system SHALL compute a content checksum for each accepted PDF and SHALL warn the teacher when an identical file already exists in the target class, without silently discarding the upload.

#### Scenario: Duplicate within class

- **WHEN** the teacher uploads a file whose checksum matches an existing lesson in the same class
- **THEN** the system warns that a duplicate exists and allows the teacher to keep or cancel the new upload

### Requirement: Private file storage

The system SHALL store original PDFs outside any public directory and SHALL serve them only through access-controlled routes.

#### Scenario: Direct public access blocked

- **WHEN** an unauthenticated client requests a stored PDF by its storage path
- **THEN** the system denies access and returns no file content

#### Scenario: Original filename retained

- **WHEN** a file is stored
- **THEN** the teacher sees the original filename in the lesson list and the stored object receives a collision-safe identifier

### Requirement: Durable processing queue

The system SHALL acknowledge accepted uploads with a queued state and SHALL continue processing independently of the teacher's browser session.

#### Scenario: Browser closed after upload

- **WHEN** the teacher closes the browser immediately after upload
- **THEN** the queued jobs continue and their statuses are available on the next visit

#### Scenario: Worker restart

- **WHEN** a worker stops while a job is in progress
- **THEN** the job is retried or marked failed after the configured attempts, without corrupting existing lesson data

### Requirement: Processing status visibility

The system SHALL expose a per-lesson status of queued, extracting, generating, rendering, ready, or failed, and SHALL show the failure reason when a lesson fails.

#### Scenario: Status progression

- **WHEN** a queued lesson is processed successfully
- **THEN** its status advances through the processing stages and ends as ready

#### Scenario: Failure reason shown

- **WHEN** generation fails after the configured retries
- **THEN** the lesson is shown as failed with a human-readable reason

### Requirement: Retry and cancellation

The system SHALL let the teacher retry a failed lesson and SHALL let the teacher cancel a lesson that is still queued or processing.

#### Scenario: Retry failed lesson

- **WHEN** the teacher retries a failed lesson
- **THEN** a new processing job is queued and the previous failure is preserved until the new attempt completes

#### Scenario: Cancel queued lesson

- **WHEN** the teacher cancels a queued lesson
- **THEN** the job is removed from the queue and the lesson is marked cancelled without generated artifacts
