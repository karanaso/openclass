"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        router.replace("/admin");
        router.refresh();
        return;
      }
      if (response.status === 429) {
        setError(t("rateLimited"));
      } else if (response.status === 503) {
        setError(t("missingConfig"));
      } else {
        setError(t("invalid"));
      }
    } catch {
      setError(t("invalid"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="space-y-2">
        <Label htmlFor="password">{t("passwordLabel")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <Button type="submit" data-testid="login-submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "…" : t("submit")}
      </Button>
    </form>
  );
}
