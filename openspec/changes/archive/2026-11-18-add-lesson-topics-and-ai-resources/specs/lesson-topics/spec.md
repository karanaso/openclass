# Spec Delta

## Purpose

Describe what each lesson is about with a small set of AI-generated bilingual keywords that teachers can curate and use to find suitable outside material.

## ADDED Requirements

### Requirement: Topic generation during lesson generation

The system SHALL generate topic keywords for a lesson from its extracted PDF text during content generation and SHALL store them separately for Greek and English.

#### Scenario: Topics generated with content

- **WHEN** content generation completes for a lesson with usable extracted text
- **THEN** the lesson has a Greek topic list and an English topic list derived from that text

#### Scenario: Topics stay source-grounded

- **WHEN** the AI produces topic keywords
- **THEN** each topic reflects a subject, concept, or term supported by the lesson text rather than an unrelated or invented subject

#### Scenario: No topics produced

- **WHEN** the AI returns no usable topics
- **THEN** generation still completes and the lesson simply has empty topic lists

#### Scenario: Bilingual topics

- **WHEN** topics are generated for a lesson
- **THEN** each topic has a Greek form and an English form so the teacher can use either interface language

### Requirement: Topic limits and normalization

The system SHALL limit each lesson to at most 8 topics per locale, SHALL trim surrounding whitespace, SHALL reject empty topics and topics longer than 40 characters, and SHALL prevent duplicate topics within the same locale.

#### Scenario: Excess topics discarded

- **WHEN** topic generation returns more than 8 topics for a locale
- **THEN** the system stores at most 8 and discards the rest

#### Scenario: Duplicate topic removed

- **WHEN** the same topic appears twice in one locale, ignoring surrounding whitespace and letter case
- **THEN** the system keeps one occurrence

#### Scenario: Oversized topic rejected

- **WHEN** a topic is empty or longer than 40 characters
- **THEN** the system rejects that topic without rejecting the remaining valid topics

### Requirement: Teacher topic editing

The system SHALL let an authenticated teacher view and replace a lesson's Greek and English topic lists from the lesson admin page without regenerating the lesson, and SHALL allow the lists to be cleared.

#### Scenario: Add and remove topics

- **WHEN** the teacher adds or removes topics and saves
- **THEN** the saved lists replace the previous lists and remain after a page reload

#### Scenario: Invalid topic edit

- **WHEN** the teacher submits an empty, duplicate, or overlong topic
- **THEN** the system rejects the save with a validation message and keeps the previously saved topic lists

#### Scenario: Clear all topics

- **WHEN** the teacher removes every topic and saves
- **THEN** the lesson has empty topic lists and no error is raised

#### Scenario: Lesson without topics

- **WHEN** the teacher opens a lesson that has no topics
- **THEN** the lesson admin page shows an empty topics state with a way to add topics

### Requirement: Topic edit preservation

The system SHALL preserve teacher-edited topic lists when the lesson is regenerated and SHALL replace AI-generated topics only while the teacher has not edited them.

#### Scenario: Regeneration keeps edited topics

- **WHEN** the teacher edits the topics and later regenerates the lesson
- **THEN** the teacher's topic lists remain unchanged

#### Scenario: Regeneration refreshes untouched topics

- **WHEN** the teacher has not edited the topics and the lesson is regenerated
- **THEN** newly generated topics replace the previous AI-generated topics

### Requirement: Best-effort topic generation

The system SHALL treat topic generation as best-effort: a provider error, timeout, or invalid topic response SHALL be logged and SHALL NOT fail lesson generation or prevent cards, questions, and the game from being published.

#### Scenario: Topic provider fails

- **WHEN** the AI request for topics fails
- **THEN** the lesson continues generating its cards and questions and reaches its normal ready state

#### Scenario: Invalid topic response discarded

- **WHEN** the AI returns malformed topic data
- **THEN** the system discards that topic data and continues without failing the lesson

### Requirement: Teacher-only topics

The system SHALL expose lesson topics and topic mutations only to authenticated teachers, and SHALL NOT include topics in student lesson data, student APIs, or student views.

#### Scenario: Student cannot see topics

- **WHEN** a student loads a lesson through a share link
- **THEN** the response and the student interface contain no lesson topics

#### Scenario: Unauthenticated topic update

- **WHEN** an unauthenticated request attempts to change lesson topics
- **THEN** the system denies the request and changes nothing

#### Scenario: Cross-origin topic mutation

- **WHEN** a topic update arrives from a different origin
- **THEN** the system rejects the request without changing the topics
