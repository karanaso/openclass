"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function LessonAccessCode({
  lessonId,
  initialCode,
}: {
  lessonId: string;
  initialCode: string;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function regenerate() {
    if (!window.confirm(t("accessCodeRegenerateConfirm"))) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}/access-code`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { accessCode?: string } | null;
      if (!response.ok || !payload?.accessCode) {
        setError(t("accessCodeRegenerateFailed"));
        return;
      }
      setCode(payload.accessCode);
      setNotice(t("accessCodeRegenerated"));
      router.refresh();
    } catch {
      setError(t("accessCodeRegenerateFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2" data-testid="lesson-access-code">
        <span className="text-sm text-muted-foreground">{t("accessCodeLabel")}</span>
        <code
          className="rounded-lg bg-secondary px-3 py-1 font-mono text-lg font-bold tracking-widest"
          data-testid="lesson-access-code-value"
        >
          {code}
        </code>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="rounded-full"
          aria-label={t("accessCodeRefresh")}
          title={t("accessCodeRefresh")}
          onClick={regenerate}
          disabled={pending}
          data-testid="refresh-lesson-access-code"
        >
          <RefreshCw className={`h-4 w-4${pending ? " animate-spin" : ""}`} aria-hidden />
        </Button>
        {pending ? <span className="text-sm text-muted-foreground">{tc("loading")}</span> : null}
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}
    </div>
  );
}
