"use client";

import { Check, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LessonTitleEditor({ lessonId, initialTitle }: { lessonId: string; initialTitle: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [draft, setDraft] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function startEditing() {
    setDraft(title);
    setError(null);
    setNotice(null);
    setEditing(true);
  }

  function cancel() {
    setDraft(title);
    setEditing(false);
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = draft.trim();
    if (!nextTitle) {
      setError(t("titleRequired"));
      return;
    }

    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      const data = (await response.json().catch(() => null)) as { lesson?: { title?: string } } | null;
      if (!response.ok) {
        setError(t("titleSaveFailed"));
        return;
      }

      const savedTitle = data?.lesson?.title ?? nextTitle;
      setTitle(savedTitle);
      setDraft(savedTitle);
      setEditing(false);
      setNotice(t("titleSaved"));
      router.refresh();
    } catch {
      setError(t("titleSaveFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      {editing ? (
        <form onSubmit={save} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={t("lessonTitle")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={200}
            autoFocus
            disabled={pending}
            data-testid="lesson-title-input"
            className="h-11 max-w-xl text-2xl font-bold"
          />
          <Button type="submit" size="sm" disabled={pending} data-testid="save-lesson-title">
            <Check className="h-4 w-4" aria-hidden />
            {pending ? tc("saving") : t("saveTitle")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={pending}>
            <X className="h-4 w-4" aria-hidden />
            {tc("cancel")}
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="lesson-title">
            {title}
          </h1>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t("editLessonTitle")}
            onClick={startEditing}
            data-testid="edit-lesson-title"
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}
    </div>
  );
}
