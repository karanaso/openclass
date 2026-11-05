"use client";

import { RotateCcw, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

const processing = new Set(["QUEUED", "EXTRACTING", "GENERATING", "RENDERING"]);

export function LessonActions({ lessonId, status }: { lessonId: string; status: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function act(path: string, method: "POST" | "DELETE") {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "DELETE" ? JSON.stringify({ confirm: true }) : undefined,
      });
      if (!response.ok) return;
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("deleteLessonConfirm"))) return;
    await act("", "DELETE");
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {status === "FAILED" || status === "CANCELLED" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => act("/retry", "POST")}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          {t("retry")}
        </Button>
      ) : null}
      {processing.has(status) ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => act("/cancel", "POST")}>
          <X className="h-4 w-4" aria-hidden />
          {t("cancelLesson")}
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" disabled={pending} onClick={remove} aria-label={tc("delete")}>
        <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
      </Button>
    </div>
  );
}
