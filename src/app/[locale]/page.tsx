import { BookOpen, Film, Gamepad2, ListChecks } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const t = await getTranslations("home");

  const features = [
    { title: t("featureCardsTitle"), body: t("featureCards"), icon: BookOpen, color: "bg-blue-100 text-blue-700" },
    { title: t("featureVideoTitle"), body: t("featureVideo"), icon: Film, color: "bg-violet-100 text-violet-700" },
    { title: t("featureGameTitle"), body: t("featureGame"), icon: Gamepad2, color: "bg-amber-100 text-amber-700" },
    { title: t("featureQuizTitle"), body: t("featureQuiz"), icon: ListChecks, color: "bg-emerald-100 text-emerald-700" },
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-16">
        <section className="mx-auto max-w-3xl text-center">
          <p className="mb-4 inline-flex rounded-full bg-primary/10 px-4 py-1 text-sm font-semibold text-primary">
            AI · PDF → Cards · Video · Game · Quiz
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">{t("title")}</h1>
          <p className="mt-5 text-lg text-muted-foreground">{t("subtitle")}</p>
          <div className="mt-8">
            <Link href="/login">
              <Button size="lg">{t("teacherCta")}</Button>
            </Link>
          </div>
        </section>

        <section className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <span className={`mb-2 grid h-11 w-11 place-items-center rounded-xl ${feature.color}`}>
                  <feature.icon className="h-5 w-5" aria-hidden />
                </span>
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.body}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </section>

        <p className="mt-16 text-center text-sm text-muted-foreground">{t("footer")}</p>
      </main>
    </div>
  );
}
