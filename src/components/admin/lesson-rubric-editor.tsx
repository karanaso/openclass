"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  MAX_RUBRIC_CRITERIA,
  MAX_RUBRIC_LEVELS,
  MIN_RUBRIC_CRITERIA,
  MIN_RUBRIC_LEVELS,
  type LessonRubric,
  type RubricCriterion,
  type RubricLevel,
} from "@/lib/rubric";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = "idle" | "saving" | "saved" | "error";
const EMPTY: LessonRubric = { criteria: [], levels: [] };

function newId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function newCriterion(): RubricCriterion {
  return { id: newId("criterion"), title: { el: "", en: "" }, description: { el: "", en: "" } };
}

function newLevel(): RubricLevel {
  return { id: newId("level"), label: { el: "", en: "" }, description: { el: "", en: "" } };
}

export function LessonRubricEditor({
  lessonId,
  initialRubric,
}: {
  lessonId: string;
  initialRubric: LessonRubric | null;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [rubric, setRubric] = useState<LessonRubric>(initialRubric ?? EMPTY);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  function resetStatus() {
    setStatus("idle");
    setError(null);
  }

  function updateCriterion(index: number, field: "title" | "description", locale: "el" | "en", value: string) {
    setRubric((current) => ({
      ...current,
      criteria: current.criteria.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: { ...item[field], [locale]: value } } : item,
      ),
    }));
    resetStatus();
  }

  function updateLevel(index: number, field: "label" | "description", locale: "el" | "en", value: string) {
    setRubric((current) => ({
      ...current,
      levels: current.levels.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: { ...item[field], [locale]: value } } : item,
      ),
    }));
    resetStatus();
  }

  function addCriterion() {
    if (rubric.criteria.length >= MAX_RUBRIC_CRITERIA) {
      setStatus("error");
      setError(t("rubricCriteriaLimit"));
      return;
    }
    setRubric((current) => ({ ...current, criteria: [...current.criteria, newCriterion()] }));
    resetStatus();
  }

  function addLevel() {
    if (rubric.levels.length >= MAX_RUBRIC_LEVELS) {
      setStatus("error");
      setError(t("rubricLevelsLimit"));
      return;
    }
    setRubric((current) => ({ ...current, levels: [...current.levels, newLevel()] }));
    resetStatus();
  }

  function removeCriterion(index: number) {
    setRubric((current) => ({ ...current, criteria: current.criteria.filter((_, itemIndex) => itemIndex !== index) }));
    resetStatus();
  }

  function removeLevel(index: number) {
    setRubric((current) => ({ ...current, levels: current.levels.filter((_, itemIndex) => itemIndex !== index) }));
    resetStatus();
  }

  function clear() {
    setRubric(EMPTY);
    resetStatus();
  }

  function validate(): string | null {
    const empty = rubric.criteria.length === 0 && rubric.levels.length === 0;
    if (empty) return null;
    if (rubric.criteria.length < MIN_RUBRIC_CRITERIA || rubric.levels.length < MIN_RUBRIC_LEVELS) {
      return t("rubricMinItems");
    }
    const hasBlankText = rubric.criteria.some(
      (item) =>
        !item.title.el.trim() ||
        !item.title.en.trim() ||
        !item.description.el.trim() ||
        !item.description.en.trim(),
    ) || rubric.levels.some(
      (item) =>
        !item.label.el.trim() ||
        !item.label.en.trim() ||
        !item.description.el.trim() ||
        !item.description.en.trim(),
    );
    if (hasBlankText) return t("rubricFieldsRequired");
    return null;
  }

  async function save() {
    const validation = validate();
    if (validation) {
      setStatus("error");
      setError(validation);
      return;
    }

    setStatus("saving");
    setError(null);
    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}/rubric`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rubric),
      });
      const data = (await response.json().catch(() => null)) as { rubric?: LessonRubric | null } | null;
      if (!response.ok) throw new Error("save failed");
      setRubric(data?.rubric ?? EMPTY);
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
      setError(t("rubricSaveFailed"));
    }
  }

  const isEmpty = rubric.criteria.length === 0 && rubric.levels.length === 0;

  return (
    <Card data-testid="lesson-rubric-editor">
      <CardHeader>
        <CardTitle className="text-base">{t("rubricTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rubricHint")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {isEmpty ? <p className="text-sm text-muted-foreground">{t("rubricEmpty")}</p> : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {t("rubricCriteriaTitle")}
            </h4>
            <Button type="button" variant="outline" size="sm" onClick={addCriterion} data-testid="rubric-add-criterion">
              <Plus className="h-4 w-4" aria-hidden />
              {t("rubricAddCriterion")}
            </Button>
          </div>
          {rubric.criteria.map((criterion, index) => (
            <div key={criterion.id} className="space-y-3 rounded-xl border p-4" data-testid={`rubric-criterion-${index}`}>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCriterion(index)}
                  data-testid={`rubric-remove-criterion-${index}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  {t("rubricRemove")}
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`rubric-criterion-title-el-${index}`}>{t("rubricTitleEl")}</Label>
                  <Input
                    id={`rubric-criterion-title-el-${index}`}
                    value={criterion.title.el}
                    onChange={(event) => updateCriterion(index, "title", "el", event.target.value)}
                    data-testid={`rubric-criterion-title-el-${index}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rubric-criterion-title-en-${index}`}>{t("rubricTitleEn")}</Label>
                  <Input
                    id={`rubric-criterion-title-en-${index}`}
                    value={criterion.title.en}
                    onChange={(event) => updateCriterion(index, "title", "en", event.target.value)}
                    data-testid={`rubric-criterion-title-en-${index}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rubric-criterion-description-el-${index}`}>{t("rubricDescriptionEl")}</Label>
                  <Textarea
                    id={`rubric-criterion-description-el-${index}`}
                    value={criterion.description.el}
                    onChange={(event) => updateCriterion(index, "description", "el", event.target.value)}
                    data-testid={`rubric-criterion-description-el-${index}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rubric-criterion-description-en-${index}`}>{t("rubricDescriptionEn")}</Label>
                  <Textarea
                    id={`rubric-criterion-description-en-${index}`}
                    value={criterion.description.en}
                    onChange={(event) => updateCriterion(index, "description", "en", event.target.value)}
                    data-testid={`rubric-criterion-description-en-${index}`}
                  />
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {t("rubricLevelsTitle")}
            </h4>
            <Button type="button" variant="outline" size="sm" onClick={addLevel} data-testid="rubric-add-level">
              <Plus className="h-4 w-4" aria-hidden />
              {t("rubricAddLevel")}
            </Button>
          </div>
          {rubric.levels.map((level, index) => (
            <div key={level.id} className="space-y-3 rounded-xl border p-4" data-testid={`rubric-level-${index}`}>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeLevel(index)}
                  data-testid={`rubric-remove-level-${index}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  {t("rubricRemove")}
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`rubric-level-label-el-${index}`}>{t("rubricLabelEl")}</Label>
                  <Input
                    id={`rubric-level-label-el-${index}`}
                    value={level.label.el}
                    onChange={(event) => updateLevel(index, "label", "el", event.target.value)}
                    data-testid={`rubric-level-label-el-${index}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rubric-level-label-en-${index}`}>{t("rubricLabelEn")}</Label>
                  <Input
                    id={`rubric-level-label-en-${index}`}
                    value={level.label.en}
                    onChange={(event) => updateLevel(index, "label", "en", event.target.value)}
                    data-testid={`rubric-level-label-en-${index}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rubric-level-description-el-${index}`}>{t("rubricDescriptionEl")}</Label>
                  <Textarea
                    id={`rubric-level-description-el-${index}`}
                    value={level.description.el}
                    onChange={(event) => updateLevel(index, "description", "el", event.target.value)}
                    data-testid={`rubric-level-description-el-${index}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rubric-level-description-en-${index}`}>{t("rubricDescriptionEn")}</Label>
                  <Textarea
                    id={`rubric-level-description-en-${index}`}
                    value={level.description.en}
                    onChange={(event) => updateLevel(index, "description", "en", event.target.value)}
                    data-testid={`rubric-level-description-en-${index}`}
                  />
                </div>
              </div>
            </div>
          ))}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={status === "saving"} data-testid="rubric-save">
            <Save className="h-4 w-4" aria-hidden />
            {status === "saving" ? t("rubricSaving") : t("rubricSave")}
          </Button>
          <Button type="button" variant="outline" onClick={clear} disabled={status === "saving"} data-testid="rubric-clear">
            {t("rubricClear")}
          </Button>
          {status === "saved" ? <span className="text-sm text-primary">{t("rubricSaved")}</span> : null}
        </div>
        {status === "error" && error ? <Alert variant="error">{error}</Alert> : null}
      </CardContent>
    </Card>
  );
}
