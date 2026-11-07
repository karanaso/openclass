import { GraduationCap } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";

export async function SiteHeader({ showAdmin = false }: { showAdmin?: boolean }) {
  const t = await getTranslations("common");
  const nav = await getTranslations("nav");

  return (
    <header className="app-header">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="inline-flex items-center gap-2 font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <span>{t("appName")}</span>
        </Link>
        <div className="flex items-center gap-3">
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
