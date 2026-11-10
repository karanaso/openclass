"use client";

import { BookOpen, Film, Gamepad2, ListChecks, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { CardDeck } from "@/components/student/card-deck";
import { MillionaireGame } from "@/components/student/millionaire-game";
import { Questionnaire } from "@/components/student/questionnaire";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StudentLessonData } from "@/server/student/lesson-data";

type Tab = "cards" | "video" | "game" | "quiz";

export function LessonTabs({
  token,
  studentName,
  data,
}: {
  token: string;
  studentName: string;
  data: StudentLessonData;
}) {
  const t = useTranslations("student");
  const videoT = useTranslations("admin.videoStatus");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab") as Tab | null;

  const available: Record<Tab, boolean> = {
    cards: data.cards.length > 0,
    video: data.videos.length > 0,
    game: data.game.length > 0,
    quiz: data.questionnaire.length > 0,
  };
  const tabOrder: Tab[] = ["cards", "video", "game", "quiz"];
  const firstAvailable = tabOrder.find((tab) => available[tab]) ?? "cards";
  const [active, setActive] = useState<Tab>(requested && available[requested] ? requested : firstAvailable);

  useEffect(() => {
    if (requested && available[requested]) setActive(requested);
  }, [requested, available]);

  function select(tab: Tab) {
    setActive(tab);
    const query = new URLSearchParams(searchParams.toString());
    query.set("tab", tab);
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  }

  async function changeName() {
    await fetch(`/api/s/${encodeURIComponent(token)}/session`, { method: "DELETE" });
    router.refresh();
  }

  const primaryVideo =
    data.videos.find((video) => Boolean(video.videoUrl) && video.locale === data.contentLocale) ??
    data.videos.find((video) => Boolean(video.videoUrl));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{data.lesson.className}</p>
          <h1 className="text-2xl font-black sm:text-3xl">{data.lesson.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("welcome", { name: studentName })}</p>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <Button variant="ghost" size="sm" onClick={changeName}>
            <LogOut className="h-4 w-4" aria-hidden />
            {t("changeName")}
          </Button>
        </div>
      </div>

      {data.fallbackUsed ? <Alert variant="warning">{t("fallbackNotice")}</Alert> : null}

      <div role="tablist" className="flex flex-wrap gap-2">
        {tabOrder.map((tab) => {
          if (!available[tab]) return null;
          const icons = { cards: BookOpen, video: Film, game: Gamepad2, quiz: ListChecks };
          const Icon = icons[tab];
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={active === tab}
              data-testid={`tab-${tab}`}
              onClick={() => select(tab)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold ${
                active === tab ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t(`tabs.${tab}`)}
            </button>
          );
        })}
      </div>

      <div>
        {active === "cards" && available.cards ? (
          <CardDeck
            token={token}
            lessonId={data.lesson.id}
            cards={data.cards}
            initiallyViewed={data.deckViewed}
          />
        ) : null}

        {active === "video" && available.video ? (
          <div className="space-y-3" data-testid="video-tab">
            {primaryVideo ? (
              <>
                <video
                  controls
                  preload="metadata"
                  poster={primaryVideo.posterUrl ?? undefined}
                  className="w-full rounded-2xl border bg-black"
                  data-testid="video-player"
                >
                  <source src={primaryVideo.videoUrl ?? undefined} type="video/mp4" />
                  {primaryVideo.captionsUrl ? (
                    <track kind="captions" src={primaryVideo.captionsUrl} srcLang={primaryVideo.locale} default />
                  ) : null}
                </video>
                <div className="flex flex-wrap gap-2">
                  {data.videos.map((video) => (
                    <Badge key={video.locale} variant={video.status === "READY" ? "success" : video.status === "FAILED" ? "destructive" : "warning"}>
                      {video.locale.toUpperCase()} · {videoT(video.status as Parameters<typeof videoT>[0])}
                    </Badge>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
                {data.videos.some((video) => video.status === "RENDERING" || video.status === "PENDING") ? (
                  <div className="space-y-1">
                    <p>{t("videoProcessing")}</p>
                    {typeof data.videos.find((video) => video.progress !== null)?.progress === "number" ? (
                      <p className="text-xs">
                        {t("videoProgress", {
                          progress: data.videos.find((video) => video.progress !== null)?.progress ?? 0,
                        })}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  t("unavailable")
                )}
              </div>
            )}
          </div>
        ) : null}

        {active === "game" && available.game ? (
          <MillionaireGame
            token={token}
            lessonId={data.lesson.id}
            locale={data.contentLocale as "el" | "en"}
            hasQuestions={data.game.length > 0}
          />
        ) : null}

        {active === "quiz" && available.quiz ? (
          <Questionnaire
            token={token}
            lessonId={data.lesson.id}
            questions={data.questionnaire}
            locale={data.contentLocale as "el" | "en"}
            initialAnswers={data.draftAnswers}
            existingResult={data.existingResult}
            canRetake={data.lesson.retakeEnabled}
          />
        ) : null}
      </div>
    </div>
  );
}
