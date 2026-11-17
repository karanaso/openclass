"use client";

import { BookOpen, FileText, Gamepad2, ListChecks, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { CardDeck } from "@/components/student/card-deck";
import { PdfViewer } from "@/components/student/pdf-viewer";
import { MillionaireGame } from "@/components/student/millionaire-game";
import { Questionnaire } from "@/components/student/questionnaire";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { StudentLessonData } from "@/server/student/lesson-data";

type Tab = "pdf" | "cards" | "game" | "quiz";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab") as Tab | null;

  const available: Record<Tab, boolean> = {
    pdf: Boolean(data.sourceDocument),
    cards: data.cards.length > 0,
    game: data.game.length > 0,
    quiz: data.questionnaire.length > 0,
  };
  const tabOrder: Tab[] = ["pdf", "cards", "game", "quiz"];
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
          const icons = { pdf: FileText, cards: BookOpen, game: Gamepad2, quiz: ListChecks };
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
        {active === "pdf" && data.sourceDocument ? (
          <PdfViewer token={token} url={data.sourceDocument.url} />
        ) : null}

        {active === "cards" && available.cards ? (
          <CardDeck
            token={token}
            lessonId={data.lesson.id}
            cards={data.cards}
            initiallyViewed={data.deckViewed}
          />
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
