"use client";

import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccessCodeEntry() {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!lockoutUntil) return;
    const tick = () => {
      const next = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setSecondsLeft(next);
      if (next <= 0) {
        setLockoutUntil(null);
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const locked = secondsLeft > 0;

  function handleChange(value: string) {
    setCode(value.replace(/\D/g, "").slice(0, 9));
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (locked) return;
    if (code.length !== 9) {
      setError(t("accessCodeInvalid"));
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/s/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json().catch(() => null)) as {
        lessonId?: string;
        error?: { code?: string; details?: { retryAfter?: number } };
      } | null;

      if (response.ok) {
        router.push(`/s/${code}`);
        return;
      }
      if (response.status === 429) {
        const headerRetry = Number(response.headers.get("retry-after"));
        const retryAfter =
          payload?.error?.details?.retryAfter ?? (Number.isFinite(headerRetry) && headerRetry > 0 ? headerRetry : 30);
        setLockoutUntil(Date.now() + Math.max(1, retryAfter) * 1000);
        return;
      }
      setError(payload?.error?.code === "code_not_found" ? t("accessCodeNotFound") : t("accessCodeInvalid"));
    } catch {
      setError(tc("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-6 text-left shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h2 className="font-bold">{t("accessCodeTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("accessCodeSubtitle")}</p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="lesson-access-code">{t("accessCodeLabel")}</Label>
          <Input
            id="lesson-access-code"
            data-testid="access-code-input"
            value={code}
            onChange={(event) => handleChange(event.target.value)}
            placeholder={t("accessCodePlaceholder")}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={9}
            autoComplete="off"
            disabled={pending || locked}
            className="text-center text-lg font-semibold tracking-[0.3em]"
          />
        </div>
        {locked ? <Alert variant="warning">{t("accessCodeLocked", { seconds: secondsLeft })}</Alert> : null}
        {!locked && error ? <Alert variant="error">{error}</Alert> : null}
        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={pending || locked}
          data-testid="access-code-submit"
        >
          <KeyRound className="h-4 w-4" aria-hidden />
          {pending ? tc("loading") : t("accessCodeSubmit")}
        </Button>
      </form>
    </div>
  );
}
