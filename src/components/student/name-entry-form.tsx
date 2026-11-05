"use client";

import { LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NameEntryForm({ token, defaultName = "" }: { token: string; defaultName?: string }) {
  const t = useTranslations("student");
  const tc = useTranslations("common");
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/s/${encodeURIComponent(token)}/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        setError(tc("error"));
        return;
      }
      router.refresh();
    } catch {
      setError(tc("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="space-y-2">
        <Label htmlFor="student-name">{t("nameLabel")}</Label>
        <Input
          id="student-name"
          data-testid="student-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("namePlaceholder")}
          maxLength={80}
          autoFocus
          required
        />
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={pending} data-testid="student-start">
        <LogIn className="h-4 w-4" aria-hidden />
        {t("enter")}
      </Button>
    </form>
  );
}
