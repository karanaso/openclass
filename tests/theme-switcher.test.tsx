// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "@/components/theme/theme-provider";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { THEME_STORAGE_KEY } from "@/lib/theme";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      theme: "Theme",
      themeLight: "Light",
      themeDark: "Dark",
      themeSystem: "System",
    })[key] ?? key,
}));

const labels = ["light", "dark", "system"] as const;

let mediaMatches = false;
const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();

const mediaQueryList = {
  get matches() {
    return mediaMatches;
  },
  media: "(prefers-color-scheme: dark)",
  onchange: null,
  addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
    mediaListeners.add(listener);
  },
  removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
    mediaListeners.delete(listener);
  },
  addListener: (listener: (event: MediaQueryListEvent) => void) => mediaListeners.add(listener),
  removeListener: (listener: (event: MediaQueryListEvent) => void) => mediaListeners.delete(listener),
  dispatchEvent: () => true,
};

function setSystemDark(value: boolean) {
  mediaMatches = value;
  const event = { matches: value } as MediaQueryListEvent;
  act(() => {
    for (const listener of mediaListeners) listener(event);
  });
}

function Probe() {
  const { preference, resolvedTheme } = useTheme();
  return (
    <span data-testid="theme-probe">
      {preference}:{resolvedTheme}
    </span>
  );
}

function renderTheme() {
  return render(
    <ThemeProvider>
      <ThemeSwitcher />
      <Probe />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme-preference");
  document.documentElement.style.colorScheme = "";
  mediaMatches = false;
  mediaListeners.clear();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(mediaQueryList),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ThemeSwitcher", () => {
  it("defaults to the system preference and follows a dark system", () => {
    setSystemDark(true);
    renderTheme();

    expect(screen.getByTestId("theme-switcher")).toHaveValue("system");
    expect(screen.getByTestId("theme-probe")).toHaveTextContent("system:dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.themePreference).toBe("system");
  });

  it("restores a saved dark preference", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    renderTheme();

    expect(screen.getByTestId("theme-switcher")).toHaveValue("dark");
    expect(screen.getByTestId("theme-probe")).toHaveTextContent("dark:dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("is labelled and exposes the three localized choices", () => {
    renderTheme();

    const select = screen.getByTestId("theme-switcher");
    expect(select).toHaveAccessibleName("Theme");
    expect(screen.getByRole("combobox", { name: "Theme" })).toBe(select);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Light",
      "Dark",
      "System",
    ]);
  });

  it("switches to light, dark, and system and persists the choice", () => {
    renderTheme();

    fireEvent.change(screen.getByTestId("theme-switcher"), { target: { value: "light" } });
    expect(screen.getByTestId("theme-probe")).toHaveTextContent("light:light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    fireEvent.change(screen.getByTestId("theme-switcher"), { target: { value: "dark" } });
    expect(screen.getByTestId("theme-probe")).toHaveTextContent("dark:dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    fireEvent.change(screen.getByTestId("theme-switcher"), { target: { value: "system" } });
    expect(screen.getByTestId("theme-probe")).toHaveTextContent("system:light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("follows operating system changes while using the system preference", () => {
    renderTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    setSystemDark(true);
    expect(screen.getByTestId("theme-probe")).toHaveTextContent("system:dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    setSystemDark(false);
    expect(screen.getByTestId("theme-probe")).toHaveTextContent("system:light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("does not follow operating system changes after an explicit choice", () => {
    renderTheme();
    fireEvent.change(screen.getByTestId("theme-switcher"), { target: { value: "light" } });

    setSystemDark(true);

    expect(screen.getByTestId("theme-probe")).toHaveTextContent("light:light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("updates when another tab changes the stored preference", () => {
    renderTheme();
    fireEvent.change(screen.getByTestId("theme-switcher"), { target: { value: "light" } });

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" }));
    });

    expect(screen.getByTestId("theme-switcher")).toHaveValue("dark");
    expect(screen.getByTestId("theme-probe")).toHaveTextContent("dark:dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("keeps working when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    renderTheme();
    fireEvent.change(screen.getByTestId("theme-switcher"), { target: { value: "dark" } });

    expect(screen.getByTestId("theme-switcher")).toHaveValue("dark");
    expect(screen.getByTestId("theme-probe")).toHaveTextContent("dark:dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("only presents supported preferences", () => {
    renderTheme();
    const values = screen.getAllByRole("option").map((option) => (option as HTMLOptionElement).value);
    expect(values).toEqual(labels);
  });
});
