# Design

## Context

See `proposal.md` for motivation and `specs/theme/spec.md` for the behavior contract.

Current constraints that shape the approach:

- The palette is a single set of HSL custom properties in `src/app/globals.css` (`:root`), consumed through semantic Tailwind tokens in `tailwind.config.ts`. `tailwind.config.ts` has no `darkMode` setting, so Tailwind currently defaults to the media-query strategy.
- There is no theme runtime, no `next-themes` dependency, and no preference stored anywhere. `src/app/[locale]/layout.tsx` is the only layout that renders `<html>` and `<body>`, and it already sets `suppressHydrationWarning` on `<html>`.
- Headers are split: `site-header.tsx` (public/login), `admin-header.tsx`, and two inline headers in the student share pages. All are server components; only `LocaleSwitcher` is a client component. The student lesson header currently has no right-hand controls.
- Several components use fixed Tailwind palette colours for feedback and accents: `ui/alert.tsx`, `ui/badge.tsx`, the home feature tiles, questionnaire/game feedback, card-deck completion text, the article failure panel, and the PDF frame's `bg-white`.
- The CSP already allows inline scripts (`script-src 'self' 'unsafe-inline'`), so a first-paint inline script needs no header change.
- Messages are validated for exact key parity between `messages/en.json` and `messages/el.json`.

## Goals / Non-Goals

**Goals:**

- One source of truth for preference and resolved theme, shared by every header and testable outside React.
- Correct palette on the first painted frame, with no hydration mismatch and no dependency on a new package.
- Minimal, local changes to existing components: semantic tokens stay, status colours get dark variants.
- Keep the existing UI primitives and header layout intact; the new control behaves like the locale switcher.

**Non-Goals:**

- Adding a second, fully separate CSS theme file, per-user server-side theme settings, or syncing the preference to the database.
- Theming the PDF document content itself; only the surrounding frame and controls follow the theme.
- Adding arbitrary accent-colour choices, high-contrast mode, or a theme editor.
- Replacing Tailwind with another styling system or redesigning the existing light palette.
- Server-side rendering the preference from a cookie. The inline script plus `useSyncExternalStore` covers first paint and hydration without adding a cookie.

## Decisions

### 1. Class-based dark mode over the existing CSS variables

Set `darkMode: ["class"]` in `tailwind.config.ts` and add `.dark` overrides for every variable in `globals.css`:

```css
:root { /* existing light values, plus --ambient-primary/--ambient-accent */ }
.dark {
  --background: 222 47% 8%;
  --foreground: 210 40% 96%;
  --card: 222 40% 12%;
  --card-foreground: 210 40% 96%;
  --primary: 217 91% 60%;
  --primary-foreground: 222 47% 8%;
  --secondary: 217 33% 18%;
  --secondary-foreground: 210 40% 96%;
  --muted: 217 33% 18%;
  --muted-foreground: 215 20% 70%;
  --accent: 43 96% 56%;
  --accent-foreground: 222 47% 11%;
  --destructive: 0 63% 50%;
  --destructive-foreground: 210 40% 98%;
  --border: 217 33% 24%;
  --input: 217 33% 24%;
  --ring: 217 91% 65%;
  --ambient-primary: 59 130 246;
  --ambient-accent: 250 204 21;
  color-scheme: dark;
}
```

`html.dark` gets `color-scheme: dark`; `:root` keeps `color-scheme: light`. The body radial gradients switch to `rgb(var(--ambient-primary) / 0.08)` and `rgb(var(--ambient-accent) / 0.1)` so the glow does not become a washed-out light wash on dark backgrounds.

**Why:** variables already drive every semantic token, so one class swap re-themes the whole app. A separate `[data-theme="dark"]` selector would duplicate the same rules. Using class strategy (rather than media only) is required so an explicit light choice can override a dark OS, and an explicit dark choice can override a light OS.

**Alternative considered:** `darkMode: "media"` with no class. Rejected because it cannot honour an explicit override and would paint both palettes incorrectly for users whose choice differs from their OS.

### 2. A small pure theme module plus a client provider

Add `src/lib/theme.ts`:

- `type ThemePreference = "light" | "dark" | "system"`
- `type ResolvedTheme = "light" | "dark"`
- `THEME_STORAGE_KEY = "lessonlab-theme"`
- `isThemePreference(value)`
- `resolveTheme(preference, systemPrefersDark)`
- `applyTheme(resolved)` → toggles `document.documentElement.classList` and sets `document.documentElement.style.colorScheme`
- `themeInitScript` → a minified string used by the first-paint script

Add `src/components/theme/theme-provider.tsx` with a context exposing `{ preference, resolvedTheme, setPreference }`. The provider:

- Uses `useSyncExternalStore` with `subscribe`, `getSnapshot`, and `getServerSnapshot`. The server snapshot is `"system"`; the client snapshot reads the saved preference, falling back to system. React updates after hydration without a mismatch warning.
- Subscribes to `matchMedia("(prefers-color-scheme: dark)")` changes only while the preference is system, and to cross-tab `storage` events.
- On preference change, writes storage inside `try/catch`, applies the resolved theme, and updates state. If storage throws, state still changes for the current session.

**Why:** a pure module makes resolution and persistence testable without React, and `useSyncExternalStore` is the supported way to render a client-only external value without hydration differences. It avoids adding `next-themes` for a 30-line concern and keeps the first-paint script under our control.

**Alternative considered:** `next-themes`. It would work, but it adds a dependency, its own script and attribute conventions, and another layer to test for a single preference. The app already hand-rolls its locale preference similarly.

### 3. First-paint script in the locale layout

In `src/app/[locale]/layout.tsx`, render a `<head>` containing one blocking inline script that:

1. Reads `localStorage[THEME_STORAGE_KEY]` inside `try/catch`.
2. Falls back to `"system"` when the value is missing or invalid.
3. Resolves against `matchMedia("(prefers-color-scheme: dark)").matches`.
4. Applies `document.documentElement.classList.toggle("dark", resolved === "dark")` and sets `document.documentElement.style.colorScheme = resolved`.
5. Also writes `document.documentElement.dataset.themePreference = preference` so CSS and diagnostics can see the chosen mode.

The script must be self-contained (no imports), run before the body renders, and never throw. It does not need a CSP change because inline scripts are already allowed.

**Why:** the server cannot know a browser-only preference, so the earliest reliable point is an inline head script. Waiting for React effects produces the flash described in the spec. Rendering `<head>` in the locale layout is valid because it is the root layout that owns `<html>`.

### 4. Theme control mirrors the locale switcher

Add `src/components/theme/theme-switcher.tsx` as a client component: a labelled `<select>` with a leading Sun/Moon/Monitor icon, matching `LocaleSwitcher`'s markup, sizing, and focus treatment. It exposes the three options from messages (`themeLight`, `themeDark`, `themeSystem`) with `aria-label={t("theme")}` and the visible mode driven by the provider.

Place it directly before `<LocaleSwitcher />` in `site-header.tsx` and `admin-header.tsx`; in the share-landing header, wrap the existing `LocaleSwitcher` and the new control in a right-hand flex group; in the student lesson header, add a right-hand group containing only the theme control.

**Why:** a native `<select>` needs no popover focus management, is immediately keyboard- and screen-reader-operable, and is already the established pattern. A cycling icon button would be smaller but makes discovering all three modes harder and complicates the accessible label.

### 5. Dark-mode status colours stay local to the components that own them

Do not add a new status-token layer. Update the fixed palette classes in place with explicit dark variants:

- `Alert`: `dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200` and the equivalent red/emerald/amber pairs.
- `Badge`: dark variants for success, warning, and destructive.
- Home feature tiles: `dark:bg-blue-500/15 dark:text-blue-300`, etc.
- Questionnaire review chips, correct-answer text, game feedback panels, card-deck completion text, article failure panel, and uploader status icons: dark variants that preserve the existing hue and meaning.
- `pdf-viewer.tsx`: replace the frame's `bg-white` with `bg-card`; the PDF page content is rendered by the browser and remains as-is.

**Why:** these colours are component-specific decisions, not part of the global semantic palette. Dark variants keep the light theme pixel-compatible and avoid expanding the design system for one-off states.

### 6. Test strategy

- `tests/theme.test.ts`: `resolveTheme` for all preference/system combinations, preference validation, and `themeInitScript` behaviour under a jsdom document with mocked storage and matchMedia.
- `tests/theme-switcher.test.tsx`: renders the control with a test provider, verifies labels, selection, `documentElement.classList`, storage writes, system-media changes, and storage-denied tolerance.
- `tests/messages.test.ts` already enforces key parity; new keys are covered by the existing test.
- An e2e test opens the public page, selects dark, reloads, checks the `dark` class and dark background, switches locale, and confirms the theme survives; a second check opens a student lesson path if the existing e2e fixtures make that cheap, otherwise the component tests cover the shared provider.

## Risks / Trade-offs

- **Inline script blocked by a future CSP change** → Keep it dependency-free and add a test for the generated script; any future nonce-based CSP must add the nonce to this script.
- **Hydration warning from the theme control** → Use `useSyncExternalStore` with a stable `"system"` server snapshot so server and first client render agree, then update after hydration.
- **Brief default label before hydration** → The palette is already correct from the inline script; only the select's selected option settles after hydration. Accepted because the alternative is a server cookie or a hidden control.
- **Hardcoded colours missed** → Grep for palette classes and `bg-white`/`text-*` during implementation, and include a manual pass over public, login, admin, student landing, and all lesson tabs in both themes.
- **Low contrast in the dark palette** → Use the stated HSL values as a floor and check body, muted, primary, and status text against their backgrounds; adjust variables rather than patching individual screens.
- **System-theme listener leaks or double-applies** → Centralize the listener in the provider, clean it up on unmount/preference change, and keep the inline script one-shot.
- **Flash on locale navigation** → Locale changes are same-origin client navigations and the class lives on `<html>`, so no re-evaluation is needed; an e2e case verifies it.

## Migration Plan

No data migration. Deploying the change is additive: existing visitors have no stored preference and start in system mode. Rollback is removing the provider/script and dark rules; stored keys are harmless if left behind. There are no API or database changes.

## Open Questions

None blocking. Exact dark HSL values can be tuned during visual review without changing the spec or task breakdown.
