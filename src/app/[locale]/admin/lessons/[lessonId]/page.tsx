import { ArrowLeft, BookOpen, Bot, FileText, ListChecks, Video } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { LessonActions } from "@/components/admin/lesson-actions";
import { LessonStatus } from "@/components/admin/lesson-status";
import { Link } from "@/i18n/navigation";
import { formatDate, formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { getLessonDetail } from "@/server/services/classes";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ locale: string; lessonId: string }>;
}) {
  const { locale, lessonId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");

  let lesson;
  try {
    lesson = await getLessonDetail(lessonId);
  } catch {
    notFound();
  }

  const tokens = lesson.jobs.reduce((sum, job) => sum + job.inputTokens + job.outputTokens, 0);
  const cost = lesson.jobs.reduce((sum, job) => sum + job.estimatedCostUsd, 0);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/admin/classes/${lesson.classId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {lesson.class.name}
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{lesson.title}</h1>
            <p className="mt-1 text-muted-foreground">
              {lesson.originalFilename} · {lesson.pageCount ?? 0} {t("pages").toLowerCase()} ·{" "}
              {formatDate(lesson.createdAt, locale as Locale)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <LessonStatus
              lessonId={lesson.id}
              initialStatus={lesson.status}
              initialFailureReason={lesson.failureReason}
            />
            <LessonActions lessonId={lesson.id} status={lesson.status} />
          </div>
        </div>
      </div>
      {(lesson.status === "QUEUED" || lesson.status === "EXTRACTING" || lesson.status === "GENERATING" || lesson.status === "RENDERING") ? (
        <Alert variant="info">{t("processingHint")}</Alert>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" aria-hidden />
              {t("originalFile")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{lesson.originalFilename}</p>
            <p className="text-muted-foreground">
              {t("pages")}: {lesson.pageCount ?? 0}
            </p>
            <p className="text-muted-foreground">
              {t("originalFile")}: {lesson.sourceLocale.toUpperCase()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4" aria-hidden />
              {t("usage")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              {t("tokens")}: {formatNumber(tokens, locale as Locale)}
            </p>
            <p>
              {t("cost")}: ${cost.toFixed(2)}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {lesson.jobs.map((job) => (
                <Badge key={job.id} variant={job.status === "FAILED" ? "destructive" : "secondary"}>
                  {job.stage}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" aria-hidden />
              {t("artifacts")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <p>
              {t("cardsCount")}: <strong>{lesson._count.cards}</strong>
            </p>
            <p>
              {t("questionsCount")}: <strong>{lesson._count.questions}</strong>
            </p>
            <p>
              {t("results")}: <strong>{lesson._count.attempts}</strong>
            </p>
            <p>
              {t("deckViews")}: <strong>{lesson._count.deckViews}</strong>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Video className="h-4 w-4" aria-hidden />
              {t("videoVariants")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lesson.videos.length === 0 ? (
              <p className="text-muted-foreground">{t("noVideos")}</p>
            ) : (
              lesson.videos.map((video) => (
                <div key={video.id} className="flex items-center justify-between gap-2">
                  <span>{video.locale.toUpperCase()}</span>
                  <Badge
                    variant={
                      video.status === "READY"
                        ? "success"
                        : video.status === "FAILED"
                          ? "destructive"
                          : video.status === "SKIPPED"
                            ? "secondary"
                            : "warning"
                    }
                  >
                    {t(`videoStatus.${video.status}`)}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4" aria-hidden />
            {t("shareLinks")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {lesson.shareLinks.length === 0 ? (
            <p className="text-muted-foreground">{t("noShareLinks")}</p>
          ) : (
            lesson.shareLinks.map((link) => (
              <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <span>{link.lessonId ? t("shareLesson") : t("shareClass")}</span>
                <span className="text-muted-foreground">
                  {link.expiresAt ? `${t("expiresAt")}: ${formatDate(link.expiresAt, locale as Locale)}` : t("noExpiry")}
                </span>
                <Badge variant={link.revokedAt ? "destructive" : "success"}>
                  {link.revokedAt ? t("revoked") : t("status.READY")}
                </Badge>
              </div>
            ))
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link href={`/admin/lessons/${lesson.id}/results`}>
              <Button variant="outline" size="sm">
                {t("results")}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
