import { BookOpen, GraduationCap } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { NameEntryForm } from "@/components/student/name-entry-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getStoredStudentName, getStudentSession } from "@/server/auth/student";
import { hashShareToken, resolveShareToken } from "@/server/services/share-links";

export const dynamic = "force-dynamic";

export default async function ShareLandingPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("student");
  const errors = await getTranslations("errors");
  const common = await getTranslations("common");

  let share: Awaited<ReturnType<typeof resolveShareToken>> | null = null;
  let errorMessage: string | null = null;
  try {
    share = await resolveShareToken(token);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as { code: string }).code) : "";
    errorMessage = code === "expired_token" ? errors("expiredToken") : errors("invalidToken");
  }

  const session = await getStudentSession();
  const storedName = await getStoredStudentName();
  const sessionMatches = Boolean(session && session.tokenHash === hashShareToken(token));

  if (share && share.lessonId && sessionMatches) {
    redirect(`/${locale}/s/${token}/lesson/${share.lessonId}`);
  }

  return (
    <div className="min-h-screen">
      <header className="app-header">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="inline-flex items-center gap-2 font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </span>
            {common("appName")}
          </Link>
          <LocaleSwitcher />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        {errorMessage ? (
          <Alert variant="error">{errorMessage}</Alert>
        ) : share ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">
                  {share.lesson ? share.lesson.title : share.class?.name}
                </CardTitle>
                <CardDescription>
                  {share.lesson
                    ? t("nameSubtitle")
                    : share.class?.description || t("nameSubtitle")}
                </CardDescription>
              </CardHeader>
              {!sessionMatches ? (
                <CardContent>
                  <h2 className="mb-4 text-lg font-semibold">{t("nameTitle")}</h2>
                  <NameEntryForm token={token} defaultName={session?.name ?? storedName ?? ""} />
                </CardContent>
              ) : share.class ? (
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t("welcome", { name: session!.name })}</p>
                  {share.class.lessons.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      {t("unavailable")}
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      {share.class.lessons.map((lesson) => (
                        <Link
                          key={lesson.id}
                          href={`/s/${token}/lesson/${lesson.id}`}
                          className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 hover:bg-secondary"
                        >
                          <span className="flex items-center gap-2 font-medium">
                            <BookOpen className="h-4 w-4 text-primary" aria-hidden />
                            {lesson.title}
                          </span>
                          <span className="text-xs text-muted-foreground">{lesson.pageCount ?? 0}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              ) : null}
            </Card>
          </div>
        ) : null}
      </main>
    </div>
  );
}
