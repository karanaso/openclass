# Proposal

## Why

The interface currently ships a single light palette defined in `globals.css`, so students and teachers who prefer or need a darker screen have no way to change it. A dark theme reduces eye strain in dim classrooms and at home, and respecting the operating system preference makes the app feel consistent with the rest of the user's device.

## What Changes

- Add a light/dark appearance theme across every surface: the public site, teacher login and admin, the student share landing page, and student lesson tabs.
- Offer three preferences — **light**, **dark**, and **system** — where **system** is the default on first visit and follows the operating system's `prefers-color-scheme`; an explicit choice is remembered across visits and locale navigation.
- Add a keyboard-operable theme control to the public, admin, and student headers, labelled in Greek and English.
- Define a dark palette for the existing semantic CSS variables (`background`, `foreground`, `card`, `primary`, `muted`, `accent`, `border`, `input`, `ring`, …) and enable class-based dark styling in Tailwind.
- Apply the saved theme before first paint so a dark-theme user does not see a light flash on load, and keep the server-rendered markup and client state in sync.
- Make existing hardcoded status and accent colours legible in both themes: alerts, badges, home feature tiles, quiz/game feedback, and the PDF material container.
- Set the document `color-scheme` so native controls, form fields, and scrollbars match the active theme.

## Capabilities

### New Capabilities

- `theme`: User-selectable light, dark, and system appearance, including persistence, first-paint application, header controls, dark palette, colour-scheme integration, and legibility of status feedback in both themes.

### Modified Capabilities

<!-- No existing requirement changes: this adds a new cross-cutting appearance capability without altering navigation, localization, or student behaviour contracts. -->

## Impact

- **Styling**: `tailwind.config.ts` gains class-based dark mode; `src/app/globals.css` gains a dark variable palette, dark body treatment, and `color-scheme`.
- **Shell**: `src/app/[locale]/layout.tsx` gains a blocking first-paint theme script and a client theme provider; the four header implementations (`site-header.tsx`, `admin-header.tsx`, and the two student headers) gain the shared theme toggle.
- **Components**: New theme provider/toggle in `src/components/theme/`; shared UI primitives (`alert`, `badge`, `button`, `card`, `input`) and status-heavy screens (home features, questionnaire, millionaire game, card deck, lesson article panel, PDF viewer) get dark-safe colours.
- **Localization**: New `common.theme*` keys in `messages/el.json` and `messages/en.json`.
- **No data changes**: The preference is stored in the browser only; no database, API, or Prisma migration is required.
- **Tests**: Unit/component tests for theme resolution, persistence, toggle labelling, and first-paint script; message parity; an end-to-end check that the chosen theme survives navigation and locale switching.
