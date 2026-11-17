# pdf-presentation Specification

## Purpose

Let students read the teacher's original lesson material inside the student lesson flow, through an embedded, access-controlled PDF viewer that works on phones, tablets, and desktops.

## Requirements

### Requirement: Source document access

The system SHALL serve a lesson's original uploaded PDF only to a student with a valid session for a share link that grants access to that lesson. It SHALL NOT expose the stored file through a public path or reveal its storage location.

#### Scenario: Authorized student opens the document

- **WHEN** a student with a valid session for the lesson's share link requests the source document
- **THEN** the system returns the original PDF as an inline `application/pdf` response

#### Scenario: Missing student session

- **WHEN** a client without a student session requests the source document
- **THEN** the system denies the request and returns no file content

#### Scenario: Lesson outside the share link

- **WHEN** a student session is valid for a share link that does not grant access to the requested lesson
- **THEN** the system denies the request and returns no file content

#### Scenario: Storage path is not public

- **WHEN** a client requests the stored file by its storage path instead of the share-link route
- **THEN** the system returns no file content

### Requirement: Embedded document viewer

The system SHALL embed the lesson's source document in the PDF tab and SHALL let the student read it through the browser's document viewer without leaving the lesson.

#### Scenario: Read the material

- **WHEN** the student opens the PDF tab for a lesson with source material
- **THEN** the document is displayed inside the lesson view and can be scrolled page by page

#### Scenario: Document spans the viewport

- **WHEN** the PDF tab is displayed on a phone, tablet, or desktop screen
- **THEN** the viewer fits the available width without causing horizontal page scrolling

#### Scenario: Session expiry during reading

- **WHEN** the document request is rejected because the student session is no longer valid
- **THEN** the tab shows an explanatory message with a way to re-enter the student's name instead of an empty or broken viewer

### Requirement: Full-screen and direct open

The system SHALL provide a control to view the source document in full screen and SHALL provide a direct-open action that opens the document outside the lesson view. When the browser does not support full screen for embedded content, the direct-open action SHALL be offered instead of failing silently.

#### Scenario: Enter full screen

- **WHEN** the student activates the full-screen control in the PDF tab
- **THEN** the document expands to fill the screen and a control to exit full screen is available

#### Scenario: Full screen unavailable

- **WHEN** the student's browser does not support full screen for the embedded document
- **THEN** the system opens the document in a new tab or window instead

#### Scenario: Open outside the lesson

- **WHEN** the student activates the direct-open action
- **THEN** the document opens in a new tab or window under the same access checks

### Requirement: Source document unavailable

The system SHALL show an explanatory unavailable state, not a blank or broken viewer, when a lesson's source document cannot be retrieved, and SHALL let the student retry the retrieval.

#### Scenario: Document cannot be loaded

- **WHEN** the source document request fails for a lesson whose PDF tab is available
- **THEN** the tab explains that the material is unavailable and offers a retry action

#### Scenario: Retry succeeds

- **WHEN** the student retries after a transient failure and the document is now retrievable
- **THEN** the viewer displays the document without requiring a page reload

### Requirement: Original material fidelity

The system SHALL present the uploaded document as the teacher provided it, without machine translation, reflow, or generated annotations, and SHALL keep the PDF's own language independent of the interface locale.

#### Scenario: Interface locale changes

- **WHEN** the student switches between Greek and English while reading the document
- **THEN** the same document remains displayed and the PDF tab stays selected

#### Scenario: No generated substitutions

- **WHEN** the student views the PDF tab
- **THEN** the content shown is the stored original rather than a generated summary or reconstructed text
