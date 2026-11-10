import { ArrowLeft, Download } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getClassResults } from "@/server/services/results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ClassResultsPage({
  params,
}: {
  params: Promise<{ locale: string; classId: string }>;
}) {
  const { locale, classId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("results");
  const admin = await getTranslations("admin");

  let results;
  try {
    results = await getClassResults(classId);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/admin/classes/${classId}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {admin("backToClasses")}
          </Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            {results.class.name} · {t("classOverview")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <a href={`/api/admin/classes/${classId}/results/export`}>
          <Button variant="outline">
            <Download className="h-4 w-4" aria-hidden />
            {t("exportCsv")}
          </Button>
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: t("attempts"), value: results.stats.attempts },
          { label: t("students"), value: results.stats.students },
          { label: t("averageScore"), value: results.stats.average === null ? "—" : `${results.stats.average}%` },
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
          <CardTitle>{t("lesson")}</CardTitle>
        </CardHeader>
        <CardContent>
          {results.lessons.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">{t("lesson")}</th>
                    <th className="py-2 pr-3">{t("attempts")}</th>
                    <th className="py-2 pr-3">{t("average")}</th>
                    <th className="py-2 pr-3">{t("passRate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.lessons.map((lesson) => (
                    <tr key={lesson.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/admin/lessons/${lesson.id}/results`} className="font-medium text-primary hover:underline">
                          {lesson.title}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{lesson.attempts}</td>
                      <td className="py-2 pr-3">{lesson.average === null ? "—" : `${lesson.average}%`}</td>
                      <td className="py-2 pr-3">{lesson.passRate === null ? "—" : `${lesson.passRate}%`}</td>
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
          <CardTitle>{t("students")}</CardTitle>
        </CardHeader>
        <CardContent>
          {results.students.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">{t("student")}</th>
                    <th className="py-2 pr-3">{t("attempts")}</th>
                    <th className="py-2 pr-3">{t("lesson")}</th>
                    <th className="py-2 pr-3">{t("average")}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.students.map((student) => (
                    <tr key={student.normalizedName} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{student.name}</td>
                      <td className="py-2 pr-3">{student.attempts}</td>
                      <td className="py-2 pr-3">{student.lessons}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={(student.average ?? 0) >= 60 ? "success" : "warning"}>
                          {student.average === null ? "—" : `${student.average}%`}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
