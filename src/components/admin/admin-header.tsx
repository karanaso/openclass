import { GraduationCap } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LogoutButton } from "@/components/auth/logout-button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Link } from "@/i18n/navigation";

export async function AdminHeader() {
  const t = await getTranslations("common");
  const nav = await getTranslations("nav");

  return (
    <header className="app-header">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-4">
        <Link href="/admin" className="inline-flex items-center gap-2 font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <span className="hidden min-[480px]:inline">{t("appName")}</span>
          <span className="hidden rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground sm:inline">
            {nav("admin")}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <LocaleSwitcher />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
