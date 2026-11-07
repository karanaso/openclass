# Spec Delta

## Purpose

Defines the persistent top navigation behavior shared by the public site, teacher admin, and student lesson surfaces so primary navigation remains available at every scroll position.

## ADDED Requirements

### Requirement: Persistent top navigation

The system SHALL keep each top-level header fixed at the top edge of the viewport while the page scrolls, on the public site, teacher admin, student share landing, and student lesson surfaces.

#### Scenario: Scrolling a public page

- **WHEN** a visitor scrolls down a long public page
- **THEN** the top header remains visible at the top edge of the viewport

#### Scenario: Scrolling an admin page

- **WHEN** the teacher scrolls a class, lesson, or results page
- **THEN** the admin header remains visible with its locale switcher and logout control

#### Scenario: Scrolling a student lesson

- **WHEN** a student scrolls through cards, questions, or results
- **THEN** the student header remains visible at the top edge of the viewport

#### Scenario: Either locale

- **WHEN** the interface is shown in Greek or English
- **THEN** the header remains sticky with the same height and controls

### Requirement: Header layering and readability

The system SHALL render the sticky header above page content with a non-transparent-enough background and a separating border so scrolling content does not overlap, show through, or reduce the legibility of header controls.

#### Scenario: Content passes beneath the header

- **WHEN** page content scrolls under the header
- **THEN** the header background and border keep its text and controls readable and no page content is painted over the header

#### Scenario: Interactive controls remain usable

- **WHEN** the header is sticky and the user selects the locale switcher, a navigation link, or logout
- **THEN** the control receives the interaction instead of content underneath it

### Requirement: Sticky header preserves document flow

The system SHALL reserve the header's normal layout space so enabling stickiness does not cover the first content block, shift content horizontally, or introduce a jump when scrolling begins.

#### Scenario: Initial page load

- **WHEN** a page first renders
- **THEN** the first content block starts below the header and is fully visible

#### Scenario: Scroll starts

- **WHEN** the page transitions from the top to a scrolled position
- **THEN** the main content does not jump, resize, or shift horizontally

### Requirement: Mobile and safe-area behavior

The system SHALL keep the sticky header usable at phone and tablet widths and SHALL account for top safe-area insets on notched devices.

#### Scenario: Phone layout

- **WHEN** the page is viewed at a narrow viewport
- **THEN** the header stays sticky, its controls remain reachable, and horizontal scrolling is not introduced

#### Scenario: Notched device

- **WHEN** the page is displayed on a device reporting a top safe-area inset
- **THEN** the header content is not obscured by the device cutout and remains tappable

### Requirement: Accessible sticky navigation

The system SHALL keep header links and controls reachable by keyboard and screen reader while sticky, and SHALL preserve visible focus treatment.

#### Scenario: Keyboard navigation

- **WHEN** the user presses Tab from the top of a page
- **THEN** header controls receive focus in a logical order and the focused control is visibly indicated

#### Scenario: Reduced motion

- **WHEN** the user requests reduced motion
- **THEN** becoming sticky or scrolling introduces no motion beyond the browser's normal scroll behavior
