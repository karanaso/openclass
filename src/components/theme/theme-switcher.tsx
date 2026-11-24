"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ThemePreference } from "@/lib/theme";
import { useTheme } from "@/components/theme/theme-provider";

const OPTIONS: ReadonlyArray<{ value: ThemePreference; labelKey: "themeLight" | "themeDark" | "themeSystem"; icon: LucideIcon }> = [
  { value: "light", labelKey: "themeLight", icon: Sun },
  { value: "dark", labelKey: "themeDark", icon: Moon },
  { value: "system", labelKey: "themeSystem", icon: Monitor },
];

export function ThemeSwitcher() {
  const t = useTranslations("common");
  const { preference, setPreference } = useTheme();
  const active = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[2];
  const ActiveIcon = active.icon;

  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <ActiveIcon className="hidden h-4 w-4 min-[480px]:block" aria-hidden />
      <span className="sr-only">{t("theme")}</span>
      <select
        value={preference}
        onChange={(event) => setPreference(event.target.value as ThemePreference)}
        className="rounded-md border border-input bg-card px-1.5 py-1 text-sm sm:px-2"
        aria-label={t("theme")}
        data-testid="theme-switcher"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
