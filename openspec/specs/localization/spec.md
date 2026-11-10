# localization Specification

## Purpose

Provide a complete Greek and English experience across the teacher and student interfaces and all generated learning content, with Greek as the default locale.

## Requirements

### Requirement: Supported locales

The system SHALL support Greek (`el`) and English (`en`) and SHALL use Greek as the default when no preference is available.

#### Scenario: First visit without preference

- **WHEN** a visitor with no stored locale and no matching language header opens the app
- **THEN** the interface appears in Greek

#### Scenario: Supported locale requested

- **WHEN** a visitor's browser prefers English
- **THEN** the interface appears in English

### Requirement: Locale resolution

The system SHALL resolve locale in this order: explicit user selection, stored preference, `Accept-Language`, then the configured default.

#### Scenario: Explicit choice wins

- **WHEN** a stored preference is Greek but the visitor explicitly selects English
- **THEN** English is used and stored for subsequent visits

#### Scenario: Unsupported language falls back

- **WHEN** a visitor's browser prefers a language other than Greek or English
- **THEN** the default locale is used without an error

### Requirement: Complete interface localization

The system SHALL render every user-facing string for teacher and student surfaces from locale resources and SHALL NOT hardcode visible text in components.

#### Scenario: Switch interface language

- **WHEN** the user changes locale
- **THEN** navigation, forms, validation messages, empty states, and result screens all appear in the selected locale without a reload that loses context

#### Scenario: Missing translation key

- **WHEN** a localized string is missing for the selected locale
- **THEN** the system falls back to the default locale string and never displays a raw translation key

### Requirement: Localized generated content

The system SHALL present cards, questionnaire items, game questions, story narration, captions, and video variants in the selected locale when that variant exists.

#### Scenario: Student selects English content

- **WHEN** a student views a lesson in English
- **THEN** cards, questions, explanations, and any available English story narration or captions are shown from the English variants

#### Scenario: Missing content variant

- **WHEN** a requested locale variant is unavailable for a lesson mode
- **THEN** the system shows the lesson's primary locale and indicates the fallback

### Requirement: Localized formatting

The system SHALL format dates, times, numbers, and percentages according to the selected locale.

#### Scenario: Date display

- **WHEN** an attempt completed on the same timestamp is shown in Greek and in English
- **THEN** each view uses its locale's date and time formatting conventions

### Requirement: Localization of teacher-visible states

The system SHALL localize lesson processing states, failure reasons presented to the teacher, validation errors, and share-link messages.

#### Scenario: Failure message localized

- **WHEN** a lesson fails and the teacher's locale is Greek
- **THEN** the failure summary and remediation hint are shown in Greek
