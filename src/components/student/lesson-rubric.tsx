"use client";

import { Award, BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudentRubric } from "@/server/student/lesson-data";

export function LessonRubric({ rubric }: { rubric: StudentRubric }) {
  const t = useTranslations("student");

  return (
    <div className="space-y-4" data-testid="lesson-rubric">
      {rubric.fallback ? <Alert variant="warning">{t("fallbackNotice")}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5" aria-hidden />
            {t("rubricTitle")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t("rubricGuidance")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {t("rubricCriteria")}
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {rubric.criteria.map((criterion, index) => (
                <article
                  key={criterion.id}
                  className="rounded-xl border bg-card p-4"
                  data-testid={`rubric-criterion-${index}`}
                >
                  <p className="font-semibold">{criterion.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{criterion.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <Award className="h-4 w-4" aria-hidden />
              {t("rubricLevels")}
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {rubric.levels.map((level, index) => (
                <article
                  key={level.id}
                  className="rounded-xl border bg-secondary/30 p-4"
                  data-testid={`rubric-level-${index}`}
                >
                  <p className="font-semibold">{level.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{level.description}</p>
                </article>
              ))}
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
