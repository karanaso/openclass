import { ArrowLeft, Download } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { DeleteAttemptButton } from "@/components/admin/delete-attempt-button";
import { Link } from "@/i18n/navigation";
import { formatDate, formatDuration, formatPercent } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { getLessonResults } from "@/server/services/results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LessonResultsPage({
  params,
}: {
  params: Promise<{ locale: string; lessonId: string }>;
}) {
  const { locale, lessonId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("results");
  const admin = await getTranslations("admin");

  let results;
  try {
    results = await getLessonResults(lessonId);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/admin/lessons/${lessonId}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {admin("backToLesson")}
          </Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{results.lesson.title}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <a href={`/api/admin/lessons/${lessonId}/results/export`}>
          <Button variant="outline">
            <Download className="h-4 w-4" aria-hidden />
            {t("exportCsv")}
          </Button>
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: t("attempts"), value: results.stats.count },
          { label: t("average"), value: results.stats.average === null ? "—" : `${results.stats.average}%` },
          { label: t("median"), value: results.stats.median === null ? "—" : `${results.stats.median}%` },
          { label: t("passRate"), value: results.stats.passRate === null ? "—" : `${results.stats.passRate}%` },
          { label: t("deckViews"), value: results.deckViews },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase text-muted-foreground">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-black">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("attempts")}</CardTitle>
        </CardHeader>
        <CardContent>
          {results.attempts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">{t("student")}</th>
                    <th className="py-2 pr-3">{t("mode")}</th>
                    <th className="py-2 pr-3">{t("score")}</th>
                    <th className="py-2 pr-3">{t("percentage")}</th>
                    <th className="py-2 pr-3">{t("pass")}</th>
                    <th className="py-2 pr-3">{t("duration")}</th>
                    <th className="py-2 pr-3">{t("completedAt")}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {results.attempts.map((attempt) => (
                    <tr key={attempt.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{attempt.studentName}</td>
                      <td className="py-2 pr-3">
                        {attempt.mode === "QUESTIONNAIRE" ? t("modeQuestionnaire") : t("modeGame")}
                      </td>
                      <td className="py-2 pr-3">
                        {attempt.score}/{attempt.maxScore}
                      </td>
                      <td className="py-2 pr-3">{attempt.percentage}%</td>
                      <td className="py-2 pr-3">
                        <Badge variant={attempt.passed ? "success" : "destructive"}>
                          {attempt.passed ? "✓" : "—"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">{formatDuration(attempt.durationMs, locale as Locale)}</td>
                      <td className="py-2 pr-3">{formatDate(attempt.completedAt, locale as Locale)}</td>
                      <td className="py-2 text-right">
                        <DeleteAttemptButton attemptId={attempt.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("perQuestion")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {results.questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            results.questions.map((question) => (
              <div key={question.questionId} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{question.prompt}</p>
                  <Badge variant={question.correctRate < 50 ? "destructive" : question.correctRate < 75 ? "warning" : "success"}>
                    {t("correctRate")}: {formatPercent(question.correctRate, locale as Locale)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("attempts")}: {question.answered}
                </p>
                <div className="mt-3 space-y-1">
                  {question.options.map((option) => {
                    const share = question.answered === 0 ? 0 : Math.round((option.count / question.answered) * 100);
                    return (
                      <div key={option.id} className="flex items-center gap-2 text-xs">
                        <span className="w-5 font-bold">{option.id.toUpperCase()}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full bg-primary" style={{ width: `${share}%` }} />
                        </div>
                        <span className="w-16 text-right text-muted-foreground">
                          {option.count} ({share}%)
                        </span>
                        <span className="max-w-64 truncate">{option.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
