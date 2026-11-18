"use client";

import { Plus, Save, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { MAX_TOPICS_PER_LOCALE, TOPIC_MAX, topicKey, type LessonTopics } from "@/lib/topics";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LocaleKey = "el" | "en";
type SaveStatus = "idle" | "saving" | "saved" | "error";

export function LessonTopicsEditor({
  lessonId,
  initialTopics,
}: {
  lessonId: string;
  initialTopics: LessonTopics;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [topics, setTopics] = useState(initialTopics);
  const [drafts, setDrafts] = useState<Record<LocaleKey, string>>({ el: "", en: "" });
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  function resetStatus() {
    setStatus("idle");
    setError(null);
  }

  function add(locale: LocaleKey) {
    const value = drafts[locale].trim();
    if (!value) {
      setStatus("error");
      setError(t("topicRequired"));
      return;
    }
    if (value.length > TOPIC_MAX) {
      setStatus("error");
      setError(t("topicTooLong"));
      return;
    }
    if (topics[locale].length >= MAX_TOPICS_PER_LOCALE) {
      setStatus("error");
      setError(t("topicsLimit"));
      return;
    }
    if (topics[locale].some((topic) => topicKey(topic) === topicKey(value))) {
      setStatus("error");
      setError(t("topicDuplicate"));
      return;
    }

    setTopics((current) => ({ ...current, [locale]: [...current[locale], value] }));
    setDrafts((current) => ({ ...current, [locale]: "" }));
    resetStatus();
  }

  function remove(locale: LocaleKey, index: number) {
    setTopics((current) => ({
      ...current,
      [locale]: current[locale].filter((_, itemIndex) => itemIndex !== index),
    }));
    resetStatus();
  }

  function clear(locale: LocaleKey) {
    setTopics((current) => ({ ...current, [locale]: [] }));
    resetStatus();
  }

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}/topics`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ el: topics.el, en: topics.en }),
      });
      const data = (await response.json().catch(() => null)) as { topics?: LessonTopics } | null;
      if (!response.ok || !data?.topics) throw new Error("save failed");
      setTopics(data.topics);
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
      setError(t("topicSaveFailed"));
    }
  }

  function renderLocale(locale: LocaleKey, label: string) {
    return (
      <div className="space-y-2 rounded-xl border p-4">
        <Label>{label}</Label>
        <div className="flex min-h-8 flex-wrap gap-2" data-testid={`topic-list-${locale}`}>
          {topics[locale].length === 0 ? (
            <span className="text-sm text-muted-foreground">{t("topicsEmpty")}</span>
          ) : (
            topics[locale].map((topic, index) => (
              <span
                key={`${topic}-${index}`}
                className="inline-flex items-center gap-1 rounded-full border bg-secondary/40 px-2.5 py-1 text-sm"
                data-testid={`topic-chip-${locale}-${index}`}
              >
                {topic}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-secondary"
                  onClick={() => remove(locale, index)}
                  aria-label={t("topicRemove", { topic })}
                  data-testid={`topic-remove-${locale}-${index}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            value={drafts[locale]}
            onChange={(event) => {
              setDrafts((current) => ({ ...current, [locale]: event.target.value }));
              resetStatus();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(locale);
              }
            }}
            placeholder={t("topicPlaceholder")}
            aria-label={label}
            data-testid={`topic-input-${locale}`}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => add(locale)}
            data-testid={`topic-add-${locale}`}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("topicAdd")}
          </Button>
          {topics[locale].length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => clear(locale)}
              data-testid={`topic-clear-${locale}`}
            >
              {t("topicClear")}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Card data-testid="lesson-topics-editor">
      <CardHeader>
        <CardTitle className="text-base">{t("topicsTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("topicsHint")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {renderLocale("el", t("topicsGreek"))}
          {renderLocale("en", t("topicsEnglish"))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={status === "saving"} data-testid="topic-save">
            <Save className="h-4 w-4" aria-hidden />
            {status === "saving" ? t("topicSaving") : t("topicSave")}
          </Button>
          {status === "saved" ? <span className="text-sm text-primary">{t("topicSaved")}</span> : null}
        </div>
        {status === "error" && error ? <Alert variant="error">{error}</Alert> : null}
      </CardContent>
    </Card>
  );
}
