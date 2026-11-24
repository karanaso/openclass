# Spec Delta

## Purpose

Lets each visitor choose a light, dark, or system-following appearance for every surface of the application, and keeps that choice consistent, legible, and flash-free across visits and navigation.

## ADDED Requirements

### Requirement: Three appearance preferences

The system SHALL offer exactly three appearance preferences: light, dark, and system. Selecting a preference SHALL apply its effective theme to the current page without a reload.

#### Scenario: Select dark

- **WHEN** the visitor selects the dark preference
- **THEN** every themed surface switches to the dark palette immediately and remains dark while navigating

#### Scenario: Select light

- **WHEN** the visitor selects the light preference
- **THEN** every themed surface switches to the light palette immediately and remains light while navigating

#### Scenario: Select system

- **WHEN** the visitor selects the system preference
- **THEN** the applied theme becomes the theme currently reported by the operating system

### Requirement: System preference is the initial default

The system SHALL treat a visitor with no saved preference as using the system preference, without requiring the visitor to choose a theme first.

#### Scenario: First visit on a dark device

- **WHEN** a visitor with no saved preference loads the application while the operating system reports a dark color scheme
- **THEN** the application renders in the dark palette from the first paint

#### Scenario: First visit on a light device

- **WHEN** a visitor with no saved preference loads the application while the operating system reports a light color scheme
- **THEN** the application renders in the light palette from the first paint

#### Scenario: Operating system changes while on system preference

- **WHEN** the visitor is using the system preference and the operating system theme changes while the page is open
- **THEN** the applied theme follows the new system theme without a reload

### Requirement: Preference persists across visits and navigation

The system SHALL remember an explicit light or dark choice for the same browser profile and SHALL apply it on later visits, page reloads, locale changes, and navigation between public, admin, and student surfaces.

#### Scenario: Return visit

- **WHEN** a visitor who previously chose dark opens the application again in the same browser profile
- **THEN** the application opens in the dark palette

#### Scenario: Locale switch

- **WHEN** a visitor switches between Greek and English
- **THEN** the chosen appearance preference is unchanged and still applied

#### Scenario: Move between surfaces

- **WHEN** the visitor moves from the public site to teacher login, admin, or a student lesson
- **THEN** the same appearance preference is applied on the new surface

### Requirement: No flash of the wrong theme

The system SHALL apply the resolved theme before the first visible paint so a visitor does not see the opposite palette before their saved or system theme appears.

#### Scenario: Saved dark preference on load

- **WHEN** a visitor with a saved dark preference loads or reloads any page
- **THEN** the page does not first render a light background or light text before switching to dark

#### Scenario: System dark on first visit

- **WHEN** a visitor with no saved preference loads any page while the operating system reports dark
- **THEN** the first rendered frame already uses the dark palette

### Requirement: Theme control is available on every surface

The system SHALL provide a theme control in the public site header, the teacher admin header, the student share landing header, and the student lesson header.

#### Scenario: Public and login pages

- **WHEN** a visitor views the public home page or teacher login page
- **THEN** the header exposes the theme control

#### Scenario: Teacher admin

- **WHEN** a signed-in teacher views any admin page
- **THEN** the admin header exposes the theme control next to the locale and logout controls

#### Scenario: Student surfaces

- **WHEN** a student views a share landing page or an open lesson
- **THEN** the visible header exposes the theme control

### Requirement: Theme control is accessible and localized

The theme control SHALL be operable by keyboard and assistive technology, SHALL communicate its current preference and available choices, and SHALL be labelled in the active interface language.

#### Scenario: Keyboard operation

- **WHEN** the theme control receives focus via Tab
- **THEN** it shows a visible focus indicator and can change the preference using the keyboard alone

#### Scenario: Screen reader state

- **WHEN** a screen reader reaches the theme control
- **THEN** it announces the control's purpose and which preference is currently selected

#### Scenario: Greek and English labels

- **WHEN** the interface language is Greek or English
- **THEN** the theme control's visible or accessible labels use that language

### Requirement: Dark palette covers all themed surfaces

When the effective theme is dark, the system SHALL use a dark palette for page backgrounds, cards, borders, inputs, buttons, navigation, and text on every themed surface, and SHALL keep normal text and essential controls at a readable contrast.

#### Scenario: Page shell

- **WHEN** the dark theme is active
- **THEN** page and header backgrounds are dark, body text is light, and cards and borders remain distinguishable

#### Scenario: Forms and buttons

- **WHEN** the dark theme is active on a form or dialog-like panel
- **THEN** inputs, selects, buttons, and their focus rings remain visible and usable

#### Scenario: Student lesson content

- **WHEN** a student opens the lesson tabs in the dark theme
- **THEN** cards, questions, results, resources, and PDF controls use the dark palette while document content itself remains readable

### Requirement: Status feedback remains legible in both themes

The system SHALL keep informational, success, warning, error, and accent feedback readable in both themes instead of relying on light-only background and text pairs.

#### Scenario: Alerts and badges

- **WHEN** an alert or badge is shown in the dark theme
- **THEN** its text remains readable against its background and its meaning is still distinguishable by more than colour alone

#### Scenario: Quiz and game feedback

- **WHEN** a student answers a question or finishes a game in either theme
- **THEN** correct, incorrect, and completion feedback remain legible and distinguishable

### Requirement: Native controls match the active theme

The system SHALL declare the active color scheme to the browser so native form controls, scrollbars, and other user-agent UI follow the selected appearance.

#### Scenario: Dark native select and scrollbars

- **WHEN** the dark theme is active and the browser renders a native select, input, or scrollbar
- **THEN** those controls use their dark rendering instead of a light one

#### Scenario: Light theme

- **WHEN** the light theme is active
- **THEN** native controls use their light rendering

### Requirement: Theme works when browser storage is unavailable

The system SHALL apply the selected or system theme for the current session even when browser storage cannot be read or written, and SHALL NOT block or visibly fail the page because of it.

#### Scenario: Storage blocked

- **WHEN** the browser denies access to its storage
- **THEN** the page still loads, the system or default theme is applied, and the theme control still works for the current session
