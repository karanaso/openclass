import { GraduationCap } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { LessonTabs } from "@/components/student/lesson-tabs";
import { Alert } from "@/components/ui/alert";
import { Link } from "@/i18n/navigation";
import { normalizeLocale } from "@/lib/locale";
import { getStudentSession } from "@/server/auth/student";
import { hashShareToken, resolveShareToken } from "@/server/services/share-links";
import { assertLessonInShare } from "@/server/student/guard";
import { loadLessonForStudent } from "@/server/student/lesson-data";

export const dynamic = "force-dynamic";

export default async function StudentLessonPage({
  params,
}: {
  params: Promise<{ locale: string; token: string; lessonId: string }>;
}) {
  const { locale, token, lessonId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("student");
  const common = await getTranslations("common");
  const errors = await getTranslations("errors");

  let share: Awaited<ReturnType<typeof resolveShareToken>>;
  try {
    share = await resolveShareToken(token);
  } catch {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <Alert variant="error">{errors("invalidToken")}</Alert>
      </main>
    );
  }

  const session = await getStudentSession();
  if (!session || session.tokenHash !== hashShareToken(token)) {
    redirect(`/${locale}/s/${token}`);
  }

  try {
    assertLessonInShare(share, lessonId);
  } catch {
    notFound();
  }

  const data = await loadLessonForStudent({
    lessonId,
    locale: normalizeLocale(locale),
    token,
    normalizedStudentName: session.normalizedName,
  });
  if (!data) notFound();

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/80">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <Link href={`/s/${token}`} className="inline-flex items-center gap-2 font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </span>
            {common("appName")}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        {data.lesson.status !== "READY" ? (
          <div className="space-y-4">
            <h1 className="text-2xl font-black">{data.lesson.title}</h1>
            <Alert variant="warning">{t("unavailable")}</Alert>
          </div>
        ) : (
          <LessonTabs token={token} studentName={session.name} data={data} />
        )}
      </main>
    </div>
  );
}
