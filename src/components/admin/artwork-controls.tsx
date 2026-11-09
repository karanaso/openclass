"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export type ArtworkInfo = {
  status: string;
  updatedAt: string;
  lastError: string | null;
};

function artworkUrl(lessonId: string, kind: "scene" | "character", version: string) {
  return `/api/admin/lessons/${encodeURIComponent(lessonId)}/visual/${kind}?v=${encodeURIComponent(version)}`;
}

export function ArtworkControls({
  lessonId,
  visual,
  busy = false,
}: {
  lessonId: string;
  visual: ArtworkInfo | null;
  busy?: boolean;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const ready = visual?.status === "READY";
  const processing = busy || pending;

  async function regenerate() {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}/visual`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (response.ok || response.status === 409) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 border-t pt-3">
      {ready && visual ? (
        <div className="grid grid-cols-2 gap-2">
          <figure className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated private media route */}
            <img
              src={artworkUrl(lessonId, "scene", visual.updatedAt)}
              alt={t("artworkSceneAlt")}
              className="aspect-[3/2] w-full rounded-lg border object-cover"
              data-testid="artwork-scene"
            />
            <figcaption className="text-xs text-muted-foreground">{t("artworkScene")}</figcaption>
          </figure>
          <figure className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated private media route */}
            <img
              src={artworkUrl(lessonId, "character", visual.updatedAt)}
              alt={t("artworkCharacterAlt")}
              className="aspect-[3/2] w-full rounded-lg border bg-white object-contain"
              data-testid="artwork-character"
            />
            <figcaption className="text-xs text-muted-foreground">{t("artworkCharacter")}</figcaption>
          </figure>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{t("artwork")}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={processing}
          onClick={regenerate}
          data-testid="regenerate-artwork"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {processing ? t("artworkRegenerating") : visual ? t("regenerateArtwork") : t("generateArtwork")}
        </Button>
      </div>
      {visual?.lastError ? (
        <p role="alert" className="break-words text-xs text-red-700" title={visual.lastError}>
          {t("artworkLastError")}
        </p>
      ) : null}
    </div>
  );
}
