import { ArrowLeft, BookOpen, Bot, FileText, ListChecks } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  GeneratedContentActions,
  GeneratedContentCounts,
  GeneratedContentEditorProvider,
  GeneratedContentEditors,
} from "@/components/admin/generated-content-editor";
import { LessonActions } from "@/components/admin/lesson-actions";
import { LessonAccessCode } from "@/components/admin/lesson-access-code";
import { LessonRubricEditor } from "@/components/admin/lesson-rubric-editor";
import { LessonStatus } from "@/components/admin/lesson-status";
import { LessonTitleEditor } from "@/components/admin/lesson-title-editor";
import { LessonTopicsEditor } from "@/components/admin/lesson-topics-editor";
import { ResourceManager } from "@/components/admin/resource-manager";
import { ShareLinkManager } from "@/components/admin/share-link-manager";
import { Link } from "@/i18n/navigation";
import { formatDate, formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { parseLessonRubric } from "@/lib/rubric";
import { parseLessonTopics } from "@/lib/topics";
import { getLessonDetail } from "@/server/services/classes";
import { listLessonCards } from "@/server/services/cards";
import { listLessonQuestions } from "@/server/services/questions";
import { listLessonResources } from "@/server/services/resources";
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

  const [cards, questions, resources] = await Promise.all([
    listLessonCards(lesson.id),
    listLessonQuestions(lesson.id),
    listLessonResources(lesson.id),
  ]);

  const tokens = lesson.jobs.reduce((sum, job) => sum + job.inputTokens + job.outputTokens, 0);
  const cost = lesson.jobs.reduce((sum, job) => sum + job.estimatedCostUsd, 0);

  return (
    <GeneratedContentEditorProvider
      initialCardCount={lesson._count.cards}
      initialQuestionCount={lesson._count.questions}
    >
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
            <LessonTitleEditor lessonId={lesson.id} initialTitle={lesson.title} />
            <div className="mt-2">
              <LessonAccessCode lessonId={lesson.id} initialCode={lesson.accessCode} />
            </div>
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
      {(lesson.status === "QUEUED" || lesson.status === "EXTRACTING" || lesson.status === "GENERATING") ? (
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4" aria-hidden />
                {t("artifacts")}
              </CardTitle>
              <GeneratedContentActions />
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <GeneratedContentCounts />
            <p>
              {t("results")}: <strong>{lesson._count.attempts}</strong>
            </p>
            <p>
              {t("deckViews")}: <strong>{lesson._count.deckViews}</strong>
            </p>
            <p>
              {t("resourcesCount")}: <strong data-testid="lesson-resources-count">{lesson._count.resources}</strong>
            </p>
          </CardContent>
        </Card>
      </div>

      <GeneratedContentEditors
        lessonId={lesson.id}
        cards={cards}
        questions={questions}
        editable={lesson.status === "READY"}
      />

      <LessonRubricEditor lessonId={lesson.id} initialRubric={parseLessonRubric(lesson.rubric)} />

      <LessonTopicsEditor lessonId={lesson.id} initialTopics={parseLessonTopics(lesson.topics)} />

      <ResourceManager lessonId={lesson.id} initialResources={resources} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4" aria-hidden />
            {t("shareLinks")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ShareLinkManager
            lessonId={lesson.id}
            initialLinks={lesson.shareLinks.map((link) => ({
              id: link.id,
              token: link.token,
              expiresAt: link.expiresAt?.toISOString() ?? null,
              revokedAt: link.revokedAt?.toISOString() ?? null,
              createdAt: link.createdAt.toISOString(),
            }))}
          />
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
    </GeneratedContentEditorProvider>
  );
}
