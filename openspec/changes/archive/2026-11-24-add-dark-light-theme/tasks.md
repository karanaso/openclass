# Tasks

## 1. Theme foundation

- [x] 1.1 Add `src/lib/theme.ts` with the `ThemePreference`/`ResolvedTheme` types, storage key, preference validation, `resolveTheme(preference, systemPrefersDark)`, `applyTheme(resolved)`, and the self-contained `themeInitScript` string; verify by typechecking the new module with `npm run typecheck`.
- [x] 1.2 Add `tests/theme.test.ts` covering every preference/system combination, invalid stored values, `applyTheme` toggling the `dark` class and `color-scheme`, and `themeInitScript` reading storage/matchMedia without throwing; verify with `npx vitest run tests/theme.test.ts`.
- [x] 1.3 Enable `darkMode: ["class"]` in `tailwind.config.ts`, add `.dark` overrides for every color variable plus `color-scheme`, and replace the body's hardcoded gradient colors with `--ambient-primary`/`--ambient-accent` variables; verify the `.dark` block covers every `:root` color token and `npm run build` succeeds.

## 2. Theme runtime and control

- [x] 2.1 Add `src/components/theme/theme-provider.tsx` using `useSyncExternalStore` (stable `"system"` server snapshot), reading the saved preference, listening to `prefers-color-scheme` while in system mode and to cross-tab storage changes, writing storage inside `try/catch`, and applying the resolved theme; verify it renders children and exposes `preference`, `resolvedTheme`, and `setPreference` in a jsdom component test.
- [x] 2.2 Add `src/components/theme/theme-switcher.tsx` as a labelled native select mirroring `LocaleSwitcher`, with a Sun/Moon/Monitor icon, the active preference selected, and localized option labels; verify the control is keyboard-operable and announces its purpose and selected option.
- [x] 2.3 Add `tests/theme-switcher.test.tsx` covering the system default, a saved dark preference, selecting light/dark/system, applying the class and storage write, following OS changes in system mode, and continuing to work when storage access throws; verify with `npx vitest run tests/theme-switcher.test.tsx`.
- [x] 2.4 Mount the provider and the blocking first-paint script in `src/app/[locale]/layout.tsx`, setting the `dark` class, `color-scheme`, and `data-theme-preference` before the body paints; verify with `npm run build` and a browser reload that a saved dark preference renders dark on the first frame.

## 3. Header integration and localization

- [x] 3.1 Add the theme switcher beside the locale switcher in `src/components/site-header.tsx` and `src/components/admin/admin-header.tsx`; verify both headers show it in light and dark themes at desktop and phone widths.
- [x] 3.2 Add the theme switcher to the student share-landing header and the student lesson header in `src/app/[locale]/s/[token]/page.tsx` and `src/app/[locale]/s/[token]/lesson/[lessonId]/page.tsx`, wrapping existing right-hand controls where needed; verify the student surfaces show it without horizontal overflow.
- [x] 3.3 Add `common.theme`, `common.themeLight`, `common.themeDark`, and `common.themeSystem` to both `messages/en.json` and `messages/el.json`; verify with `npx vitest run tests/messages.test.ts` and by switching the interface language.

## 4. Dark palette audit

- [x] 4.1 Add dark variants to the shared primitives in `src/components/ui/alert.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, and `input.tsx`; verify alerts, badges, buttons, inputs, and focus rings are readable in both themes.
- [x] 4.2 Update the home feature tiles in `src/app/[locale]/page.tsx` and the login page for dark backgrounds; verify the public home and login pages in both themes.
- [x] 4.3 Update student surfaces — questionnaire review chips and feedback, millionaire-game feedback, card-deck completion text, PDF frame background, resources, and the article panel — with dark-safe colors; verify each lesson tab in both themes.
- [x] 4.4 Update admin status surfaces — lesson status, uploader, card/question editors, share-link manager, resource manager, and lesson article failure panel — with dark-safe colors; verify each admin view in both themes.
- [x] 4.5 Grep `src/` for remaining `bg-white`, light-only `bg-*-50/100` and `text-*-700/800/900` pairs outside intentional media surfaces, and resolve or document each; verify `npm run typecheck` and `npm run lint` pass.

## 5. Integration verification

- [x] 5.1 Add `e2e/theme.spec.ts` that opens the public page with an emulated dark system preference, confirms the dark palette on first load, selects light then dark, reloads, switches locale, and confirms the preference persists; verify with `npx playwright test e2e/theme.spec.ts`.
- [x] 5.2 Add an e2e or component integration check that a student lesson header theme change persists into the lesson tabs; verify the lesson content remains readable in both themes.
- [x] 5.3 Run the full checks — `npm run typecheck`, `npm run lint`, `npm test` — and verify no existing test regresses.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived `theme` capability appears under `openspec/specs/` with its purpose and requirements intact.
