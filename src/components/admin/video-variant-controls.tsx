"use client";

import { Film, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type VideoInfo = { locale: string; status: string; error: string | null };

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

  async function generate(locale: string) {
    setPending(locale);
    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}/video`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (response.ok) router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      {(["el", "en"] as const).map((locale) => {
        const video = videos.find((item) => item.locale === locale);
        const label = locale === "el" ? "Ελληνικά" : "English";
        if (video?.status === "READY") {
          return (
            <Badge key={locale} variant="success">
              <Film className="mr-1 h-3 w-3" aria-hidden />
              {label}
            </Badge>
          );
        }
        if (video?.status === "PENDING" || video?.status === "RENDERING") {
          return (
            <Badge key={locale} variant="warning">
              {label} · {t(`videoStatus.${video.status}`)}
            </Badge>
          );
        }
        return (
          <div key={locale} className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending !== null}
              onClick={() => generate(locale)}
              data-testid={`video-variant-${locale}`}
            >
              {video?.status === "FAILED" || video?.status === "SKIPPED" ? (
                <RotateCcw className="h-4 w-4" aria-hidden />
              ) : (
                <Film className="h-4 w-4" aria-hidden />
              )}
              {t("generateVariant")} · {label}
            </Button>
            {video?.error ? <span className="max-w-xs text-xs text-red-700">{video.error}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
