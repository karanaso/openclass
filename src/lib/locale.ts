export const locales = ["el", "en"] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "el" || value === "en";
}

export function normalizeLocale(value: string | undefined | null, fallback: Locale = "el"): Locale {
  if (isLocale(value)) return value;
  if (!value) return fallback;
  const lower = value.toLowerCase();
  if (lower.startsWith("el")) return "el";
  if (lower.startsWith("en")) return "en";
  return fallback;
}

export function negotiateLocale(input: {
  explicit?: string | null;
  stored?: string | null;
  acceptLanguage?: string | null;
  fallback?: Locale;
}): Locale {
  const fallback = input.fallback ?? "el";
  if (isLocale(input.explicit)) return input.explicit;
  if (isLocale(input.stored)) return input.stored;
  const header = input.acceptLanguage;
  if (header) {
    const preferred = header
      .split(",")
      .map((part) => {
        const [tag, q] = part.trim().split(";q=");
        return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
      })
      .sort((a, b) => b.q - a.q)
      .map((item) => item.tag);
    for (const tag of preferred) {
      if (tag.startsWith("el")) return "el";
      if (tag.startsWith("en")) return "en";
    }
  }
  return fallback;
}
