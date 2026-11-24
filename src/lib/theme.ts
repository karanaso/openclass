export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "lessonlab-theme";
export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && THEME_PREFERENCES.includes(value as ThemePreference);
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(THEME_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

export function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function writeStoredPreference(preference: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be blocked by browser privacy settings; the in-memory
    // preference still applies for the current session.
  }
}

export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function applyPreference(preference: ThemePreference, resolved: ResolvedTheme): void {
  applyTheme(resolved);
  if (typeof document === "undefined") return;
  document.documentElement.dataset.themePreference = preference;
}

const serializedPreferences = JSON.stringify(THEME_PREFERENCES);

/**
 * Self-contained script that runs in <head> before the body paints.
 * It must not import anything and must never throw.
 */
export const themeInitScript = [
  "(function(){",
  "try{",
  `var key=${JSON.stringify(THEME_STORAGE_KEY)};`,
  `var allowed=${serializedPreferences};`,
  "var preference='system';",
  "try{var stored=window.localStorage.getItem(key);if(stored&&allowed.indexOf(stored)!==-1)preference=stored;}catch(e){}",
  "var prefersDark=false;",
  `try{prefersDark=window.matchMedia(${JSON.stringify(THEME_MEDIA_QUERY)}).matches;}catch(e){}`,
  "var resolved=preference==='system'?(prefersDark?'dark':'light'):preference;",
  "var root=document.documentElement;",
  "root.classList.toggle('dark',resolved==='dark');",
  "root.style.colorScheme=resolved;",
  "root.setAttribute('data-theme-preference',preference);",
  "}catch(e){}",
  "})();",
].join("");
