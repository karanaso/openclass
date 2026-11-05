"use client";

import { Globe } from "lucide-react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { Suspense, useTransition } from "react";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/locale";

function Switcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const change = (next: Locale) => {
    const query = Object.fromEntries(searchParams.entries());
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      router.replace({ pathname, query }, { locale: next });
    });
  };

  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <Globe className="h-4 w-4" aria-hidden />
      <span className="sr-only">{locale === "el" ? "Γλώσσα" : "Language"}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(event) => change(event.target.value as Locale)}
        className="rounded-md border border-input bg-card px-2 py-1 text-sm"
        aria-label={locale === "el" ? "Γλώσσα" : "Language"}
      >
        {routing.locales.map((item) => (
          <option key={item} value={item}>
            {item === "el" ? "Ελληνικά" : "English"}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LocaleSwitcher() {
  return (
    <Suspense fallback={<span className="text-sm text-muted-foreground">…</span>}>
      <Switcher />
    </Suspense>
  );
}
