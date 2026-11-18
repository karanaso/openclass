"use client";

import { ExternalLink, Link2, Play, Youtube } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { hostLabel, isSupportedResourceUrl, youtubeEmbedUrl } from "@/lib/resources";
import type { StudentResource } from "@/server/student/lesson-data";

export function LessonResources({ resources }: { resources: StudentResource[] }) {
  const t = useTranslations("student");
  const [playingId, setPlayingId] = useState<string | null>(null);

  return (
    <div className="space-y-4" data-testid="resource-list">
      {resources.map((resource, index) => {
        const supported = isSupportedResourceUrl(resource.url);
        const isVideo =
          resource.kind === "YOUTUBE" && Boolean(resource.youtubeId) && supported;
        const host = hostLabel(resource.url);

        return (
          <article
            key={resource.id}
            className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"
            data-testid={`resource-item-${index}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <h2 className="text-lg font-bold leading-tight">{resource.title}</h2>
                {resource.description ? (
                  <p className="text-sm text-muted-foreground">{resource.description}</p>
                ) : null}
                {host ? <p className="text-xs font-medium text-muted-foreground">{host}</p> : null}
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold">
                {isVideo ? (
                  <Youtube className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Link2 className="h-3.5 w-3.5" aria-hidden />
                )}
                {isVideo ? t("resourceKindVideo") : t("resourceKindLink")}
              </span>
            </div>

            {!supported ? (
              <p className="mt-4 text-sm text-muted-foreground" data-testid={`resource-unavailable-${index}`}>
                {t("resourceUnavailable")}
              </p>
            ) : null}

            {isVideo && supported ? (
              <div className="mt-4 space-y-3">
                {playingId === resource.id ? (
                  <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                    <iframe
                      key={resource.id}
                      src={youtubeEmbedUrl(resource.youtubeId ?? "")}
                      title={t("resourceVideoPlayer", { title: resource.title })}
                      className="h-full w-full"
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      data-testid="resource-iframe"
                    />
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPlayingId(resource.id)}
                    aria-label={t("playVideoFor", { title: resource.title })}
                    data-testid={`resource-play-${index}`}
                  >
                    <Play className="h-4 w-4" aria-hidden />
                    {t("playVideo")}
                  </Button>
                )}
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  aria-label={t("watchOnYoutubeFor", { title: resource.title })}
                  data-testid={`resource-youtube-link-${index}`}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  {t("watchOnYoutube")}
                </a>
              </div>
            ) : null}

            {!isVideo && supported ? (
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-secondary"
                aria-label={t("openLinkFor", { title: resource.title })}
                data-testid={`resource-link-${index}`}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                {t("openLink")}
              </a>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
