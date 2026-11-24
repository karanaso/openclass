"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  applyPreference,
  isThemePreference,
  readStoredPreference,
  resolveTheme,
  THEME_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  writeStoredPreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

interface ThemeStore {
  getSnapshot: () => ThemePreference;
  subscribe: (listener: () => void) => () => void;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function createThemeStore(): ThemeStore {
  const listeners = new Set<() => void>();
  let inMemory: ThemePreference | null = null;
  let listening = false;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    inMemory = isThemePreference(event.newValue) ? event.newValue : "system";
    emit();
  };

  return {
    getSnapshot: () => inMemory ?? readStoredPreference(),
    subscribe: (listener) => {
      listeners.add(listener);
      if (!listening && typeof window !== "undefined") {
        window.addEventListener("storage", onStorage);
        listening = true;
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && listening && typeof window !== "undefined") {
          window.removeEventListener("storage", onStorage);
          listening = false;
        }
      };
    },
    setPreference: (next) => {
      // Keep the choice in memory even when localStorage is blocked, so the
      // control still works for the current session.
      inMemory = next;
      writeStoredPreference(next);
      emit();
    },
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<ThemeStore | null>(null);
  if (!storeRef.current) storeRef.current = createThemeStore();
  const store = storeRef.current;

  const preference = useSyncExternalStore<ThemePreference>(store.subscribe, store.getSnapshot, () => "system");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(THEME_MEDIA_QUERY);
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  const resolvedTheme = resolveTheme(preference, systemDark);

  useEffect(() => {
    applyPreference(preference, resolvedTheme);
  }, [preference, resolvedTheme]);

  const value: ThemeContextValue = {
    preference,
    resolvedTheme,
    setPreference: store.setPreference,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
