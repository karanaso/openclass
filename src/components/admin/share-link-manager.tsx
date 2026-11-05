"use client";

import { Copy, Link2, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LinkInfo = {
  id: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export function ShareLinkManager({
  classId,
  lessonId,
  initialLinks,
}: {
  classId?: string;
  lessonId?: string;
  initialLinks: LinkInfo[];
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [links, setLinks] = useState(initialLinks);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create() {
    setPending(true);
    try {
      const response = await fetch("/api/admin/share-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(classId ? { classId } : {}),
          ...(lessonId ? { lessonId } : {}),
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
        }),
      });
      if (!response.ok) return;
      const data = await response.json();
      setLinks((current) => [
        {
          id: data.link.id,
          expiresAt: data.link.expiresAt,
          revokedAt: data.link.revokedAt,
          createdAt: data.link.createdAt,
        },
        ...current,
      ]);
      const url = `${window.location.origin}/${locale}/s/${data.token}`;
      setCreatedUrl(url);
      setCopied(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm(t("revoke"))) return;
    setPending(true);
    try {
      const response = await fetch(`/api/admin/share-links/${id}`, { method: "DELETE" });
      if (!response.ok) return;
      const data = await response.json();
      setLinks((current) =>
        current.map((link) => (link.id === id ? { ...link, revokedAt: data.link.revokedAt } : link)),
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!createdUrl) return;
    await navigator.clipboard.writeText(createdUrl);
    setCopied(true);
  }

  return (
    <div className="space-y-4" data-testid="share-links">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="share-expiry">
            {t("expiresAt")} <span className="text-muted-foreground">({tc("optional")})</span>
          </Label>
          <Input
            id="share-expiry"
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </div>
        <Button onClick={create} disabled={pending} data-testid="create-share-link">
          <Plus className="h-4 w-4" aria-hidden />
          {t("createShareLink")}
        </Button>
      </div>

      {createdUrl ? (
        <div className="space-y-2 rounded-xl border bg-secondary/40 p-3">
          <p className="text-sm font-medium">{t("copyLink")}</p>
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={createdUrl} className="min-w-0 flex-1" data-testid="share-url" />
            <Button variant="outline" onClick={copy}>
              <Copy className="h-4 w-4" aria-hidden />
              {copied ? tc("copied") : tc("copy")}
            </Button>
          </div>
        </div>
      ) : null}

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noShareLinks")}</p>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" aria-hidden />
                {t("createShareLink")} · {formatDate(link.createdAt, locale)}
              </span>
              <span className="text-xs text-muted-foreground">
                {link.expiresAt ? `${t("expiresAt")}: ${formatDate(link.expiresAt, locale)}` : t("noExpiry")}
              </span>
              {link.revokedAt ? (
                <span className="text-xs font-semibold text-red-700">{t("revoked")}</span>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => revoke(link.id)} disabled={pending}>
                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                  {t("revoke")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
