# resource-extraction Specification

## Purpose

Discover candidate lesson resources from an uploaded PDF — printed URLs, link annotations, and QR codes in embedded images — during lesson processing, so teachers can review them instead of retyping them.

## Requirements

### Requirement: Resource discovery during extraction

The system SHALL inspect every extracted PDF page for candidate resource URLs and SHALL run discovery as part of the lesson extraction stage before content generation is queued.

#### Scenario: Text URL discovered

- **WHEN** a page's extracted text contains an HTTP or HTTPS URL
- **THEN** the system records that URL as a suggested resource associated with that page

#### Scenario: Link annotation discovered

- **WHEN** a page contains a URI link annotation with an HTTP or HTTPS target
- **THEN** the system records that target as a suggested resource associated with that page

#### Scenario: No resources found

- **WHEN** a PDF contains no usable URLs, annotations, or decodable QR codes
- **THEN** extraction completes normally and the lesson has no resource suggestions

### Requirement: QR code discovery

The system SHALL attempt to decode QR codes from raster images embedded in PDF pages and SHALL record decoded HTTP or HTTPS targets as resource suggestions.

#### Scenario: QR code decoded

- **WHEN** an embedded page image contains a QR code that decodes to an HTTP or HTTPS URL
- **THEN** the system records that URL as a suggested resource associated with the containing page

#### Scenario: Undecodable image

- **WHEN** an embedded image contains no QR code or the QR payload is not an HTTP or HTTPS URL
- **THEN** the system ignores that image and continues scanning the remaining pages

#### Scenario: No embedded images

- **WHEN** a PDF has no raster images, or its QR codes are drawn as vector shapes
- **THEN** discovery reports no QR-derived suggestions without failing extraction

### Requirement: Discovery is best-effort and non-blocking

The system SHALL treat resource discovery failures as non-fatal: a discovery error SHALL be logged and SHALL NOT change the lesson's processing outcome or prevent content generation.

#### Scenario: Decoder error

- **WHEN** decoding an image or reading page annotations raises an error
- **THEN** the system logs the failure, skips that page or image, and continues processing the lesson

#### Scenario: Generation still queued

- **WHEN** resource discovery finishes with errors
- **THEN** the lesson still advances to content generation and reaches its normal status

### Requirement: Discovered resources await review

The system SHALL store every discovered resource with status `SUGGESTED` and SHALL record whether it came from page text, a link annotation, or a QR code.

#### Scenario: Suggestion recorded

- **WHEN** discovery finds a candidate URL
- **THEN** the candidate is stored as a suggested resource with its source page and discovery source, and is hidden from students until approved

#### Scenario: Invalid target ignored

- **WHEN** a discovered target uses a scheme other than HTTP or HTTPS, contains invalid characters, or exceeds the URL length limit
- **THEN** the system does not create a resource for that target

### Requirement: Readable suggestion titles

The system SHALL derive a non-empty title for each discovered resource, preferring visible link text when available and otherwise using a readable form of the URL's host and path.

#### Scenario: Link text available

- **WHEN** a discovered URL is accompanied by visible anchor text in the PDF text layer
- **THEN** the suggestion uses a trimmed version of that text as its title

#### Scenario: No link text available

- **WHEN** a discovered URL has no associated visible text
- **THEN** the suggestion receives a readable title derived from the URL and can be renamed by the teacher

### Requirement: Idempotent discovery

The system SHALL deduplicate discovered URLs within a lesson and SHALL NOT create duplicate suggestions when extraction is retried or the lesson is regenerated.

#### Scenario: Duplicate URLs in one PDF

- **WHEN** the same URL appears on several pages or through several discovery sources
- **THEN** the system creates at most one suggested resource for that normalized URL, retaining the first source page

#### Scenario: Retry does not duplicate

- **WHEN** extraction runs again for a lesson that already has that URL as a resource
- **THEN** no additional resource is created and the existing resource's status and content are preserved

### Requirement: Discovery limits

The system SHALL cap the number of suggestions created per lesson and SHALL skip candidates beyond that cap rather than fail the lesson.

#### Scenario: Many candidates found

- **WHEN** a PDF yields more candidate URLs than the configured per-lesson cap
- **THEN** the system stores suggestions up to the cap and ignores the remainder

### Requirement: No external fetching

The system SHALL NOT fetch, resolve, or preview discovered URLs; discovery SHALL use only data already present in the uploaded PDF.

#### Scenario: URL in PDF

- **WHEN** the system discovers a URL
- **THEN** it stores the URL text without making a network request to that destination
