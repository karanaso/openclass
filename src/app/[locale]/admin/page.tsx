import { getTranslations } from "next-intl/server";

export default async function AdminPage() {
  const t = await getTranslations("admin");

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">{t("classesTitle")}</h1>
      <p className="mt-1 text-muted-foreground">{t("classesSubtitle")}</p>
      <div className="mt-8 rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
        {t("emptyClasses")}
      </div>
    </div>
  );
}
