"use client";

import { Film, Play, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type VideoInfo = {
  locale: string;
  status: string;
  error: string | null;
  progress?: number | null;
  hasVideo: boolean;
  hasCaptions: boolean;
  hasPoster: boolean;
};

function mediaUrl(lessonId: string, locale: string, kind: "video" | "captions" | "poster") {
  return `/api/admin/lessons/${encodeURIComponent(lessonId)}/media/${encodeURIComponent(locale)}/${kind}`;
}

export function VideoVariantControls({
  lessonId,
  videos,
}: {
  lessonId: string;
  videos: VideoInfo[];
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [previewLocale, setPreviewLocale] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function requestRender(locale: string) {
    setPending(locale);
    setPreviewLocale(null);
    setPreviewError(null);
    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}/video`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (response.ok || response.status === 409) router.refresh();
    } finally {
      setPending(null);
    }
  }

  function togglePreview(locale: string) {
    setPreviewError(null);
    setPreviewLocale((current) => (current === locale ? null : locale));
  }

  return (
    <div className="space-y-3 pt-2">
      {(["el", "en"] as const).map((locale) => {
        const video = videos.find((item) => item.locale === locale);
        const status = pending === locale ? "PENDING" : video?.status;
        const playable = Boolean(video?.hasVideo);
        const processing = Boolean(video) && (status === "PENDING" || status === "RENDERING");
        const canRecreate = Boolean(video) && !processing;
        const label = locale === "el" ? "Ελληνικά" : "English";

        return (
          <div key={locale} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{label}</span>
                {status ? (
                  <Badge
                    variant={
                      status === "READY"
                        ? "success"
                        : status === "FAILED"
                          ? "destructive"
                          : status === "SKIPPED"
                            ? "secondary"
                            : "warning"
                    }
                  >
                    {t(`videoStatus.${status}`)}
                  </Badge>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {playable ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending !== null}
                    onClick={() => togglePreview(locale)}
                    data-testid={`video-play-${locale}`}
                  >
                    <Play className="h-4 w-4" aria-hidden />
                    {t("playVariant")}
                  </Button>
                ) : null}
                {canRecreate ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending !== null}
                    onClick={() => requestRender(locale)}
                    data-testid={`video-variant-${locale}`}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    {t("recreateVariant")}
                  </Button>
                ) : null}
                {processing ? (
                  <Button size="sm" variant="outline" disabled data-testid={`video-recreate-${locale}`}>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    {t("recreateVariant")}
                  </Button>
                ) : null}
                {!video ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending !== null}
                    onClick={() => requestRender(locale)}
                    data-testid={`video-variant-${locale}`}
                  >
                    <Film className="h-4 w-4" aria-hidden />
                    {t("generateVariant")} · {label}
                  </Button>
                ) : null}
              </div>
            </div>
            {processing && typeof video?.progress === "number" ? (
              <p className="text-xs text-muted-foreground">{t("videoProgress", { progress: video.progress })}</p>
            ) : null}
            {video?.error && !processing ? (
              <p className="max-w-xs text-xs text-red-700">{video.error}</p>
            ) : null}
            {previewLocale === locale && playable ? (
              <div className="space-y-1">
                <video
                  controls
                  preload="metadata"
                  poster={video?.hasPoster ? mediaUrl(lessonId, locale, "poster") : undefined}
                  className="w-full rounded-xl border bg-black"
                  data-testid={`video-preview-${locale}`}
                  onError={() => setPreviewError(locale)}
                >
                  <source src={mediaUrl(lessonId, locale, "video")} type="video/mp4" />
                  {video?.hasCaptions ? (
                    <track
                      kind="captions"
                      src={mediaUrl(lessonId, locale, "captions")}
                      srcLang={locale}
                      default
                    />
                  ) : null}
                </video>
                {previewError === locale ? (
                  <p role="alert" className="text-xs text-red-700">
                    {t("videoPreviewUnavailable")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
