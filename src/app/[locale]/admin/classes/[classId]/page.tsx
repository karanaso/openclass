import { ArrowLeft, BookOpen, FileText } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { LessonActions } from "@/components/admin/lesson-actions";
import { LessonStatus } from "@/components/admin/lesson-status";
import { LessonUploader } from "@/components/admin/lesson-uploader";
import { ShareLinkManager } from "@/components/admin/share-link-manager";
import { Link } from "@/i18n/navigation";
import { formatDate, formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { getClassWithLessons } from "@/server/services/classes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ locale: string; classId: string }>;
}) {
  const { locale, classId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");

  let classroom;
  try {
    classroom = await getClassWithLessons(classId);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("backToClasses")}
        </Link>
        <div className="mt-4 flex items-start gap-3">
          <span className="mt-1 h-5 w-5 rounded-full" style={{ backgroundColor: classroom.color }} aria-hidden />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{classroom.name}</h1>
            {classroom.description ? <p className="mt-1 text-muted-foreground">{classroom.description}</p> : null}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" aria-hidden />
            {t("uploadTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LessonUploader classId={classroom.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("shareClass")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ShareLinkManager
            classId={classroom.id}
            initialLinks={classroom.shareLinks.map((link) => ({
              id: link.id,
              token: link.token,
              expiresAt: link.expiresAt?.toISOString() ?? null,
              revokedAt: link.revokedAt?.toISOString() ?? null,
              createdAt: link.createdAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold">{t("lessonsTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("lessonsSubtitle")}</p>
          </div>
          <Link href={`/admin/classes/${classroom.id}/results`}>
            <Button variant="outline" size="sm">
              {t("results")}
            </Button>
          </Link>
        </div>

        {classroom.lessons.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
            {t("noLessons")}
          </div>
        ) : (
          <div className="grid gap-3">
            {classroom.lessons.map((lesson) => {
              const tokens = lesson.jobs.reduce((sum, job) => sum + job.inputTokens + job.outputTokens, 0);
              const cost = lesson.jobs.reduce((sum, job) => sum + job.estimatedCostUsd, 0);
              return (
                <Card key={lesson.id}>
                  <CardHeader className="flex-row items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                        <BookOpen className="h-5 w-5" aria-hidden />
                      </span>
                      <div>
                        <CardTitle className="text-base">{lesson.title}</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {lesson.originalFilename} · {lesson.pageCount ?? 0} {t("pages").toLowerCase()} ·{" "}
                          {formatDate(lesson.createdAt, locale as Locale)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("tokens")}: {formatNumber(tokens, locale as Locale)} · {t("cost")}: ${cost.toFixed(2)} ·{" "}
                          {lesson._count.attempts} {t("results").toLowerCase()}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <LessonStatus
                        lessonId={lesson.id}
                        initialStatus={lesson.status}
                        initialFailureReason={lesson.failureReason}
                      />
                      <div className="flex items-center gap-2">
                        <LessonActions lessonId={lesson.id} status={lesson.status} />
                        <Link href={`/admin/lessons/${lesson.id}`}>
                          <Button size="sm" variant="outline">
                            {t("openLesson")}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
