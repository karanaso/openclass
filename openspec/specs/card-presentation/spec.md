# card-presentation Specification

## Purpose

Let students review a lesson as a short, accessible card deck with clear navigation and the lesson's available locale variants.

## Requirements

### Requirement: Card deck display

The system SHALL present the generated deck as an ordered sequence of cards showing a prompt side and a reveal side, with the lesson title and card position visible.

#### Scenario: Reveal a card

- **WHEN** the student activates a card
- **THEN** the system reveals the answer or explanation side without navigating away

#### Scenario: Ordered content

- **WHEN** the deck is opened
- **THEN** cards appear in the generated order and the current position and total count are shown

### Requirement: Card navigation

The system SHALL let students move to the next and previous card using on-screen controls, keyboard keys, and touch gestures.

#### Scenario: Keyboard navigation

- **WHEN** the student presses the right or left arrow key
- **THEN** the deck advances or returns by one card

#### Scenario: Boundary behavior

- **WHEN** the student is on the first or last card
- **THEN** navigation controls that would leave the deck are disabled or clamped

### Requirement: Locale selection

The system SHALL let the student switch between the available Greek and English variants of the deck without losing the current card position.

#### Scenario: Switch language mid-deck

- **WHEN** the student changes the locale while viewing a card
- **THEN** the same card is shown in the selected locale and the position is preserved

#### Scenario: Unavailable locale

- **WHEN** a locale variant is missing for the lesson
- **THEN** the system falls back to the lesson's primary locale and indicates the fallback

### Requirement: Deck completion

The system SHALL record that the student reached the end of the deck so the teacher can see deck engagement per lesson.

#### Scenario: Reach the end

- **WHEN** the student views the final card
- **THEN** the deck is marked viewed for that student and lesson and a completion state is shown

### Requirement: Accessible presentation

The system SHALL keep card content readable on mobile and desktop, SHALL support screen-reader labels for navigation and reveal controls, and SHALL respect reduced-motion preferences.

#### Scenario: Reduced motion

- **WHEN** the student's device requests reduced motion
- **THEN** card transitions are replaced with non-animated changes

#### Scenario: Unavailable deck

- **WHEN** a lesson has no published deck
- **THEN** the cards tab shows an explanatory unavailable state instead of empty or broken content
