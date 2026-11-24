import { GraduationCap } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Button } from "@/components/ui/button";

export async function SiteHeader({ showAdmin = false }: { showAdmin?: boolean }) {
  const t = await getTranslations("common");
  const nav = await getTranslations("nav");

  return (
    <header className="app-header">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-4">
        <Link href="/" className="inline-flex items-center gap-2 font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <span className="hidden min-[480px]:inline">{t("appName")}</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeSwitcher />
          <LocaleSwitcher />
          {showAdmin ? (
            <Link href="/admin">
              <Button variant="outline" size="sm">
                {nav("admin")}
              </Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button size="sm">{t("login")}</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
