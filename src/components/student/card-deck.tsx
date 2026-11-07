"use client";

import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type CardItem = { id: string; prompt: string; answer: string };

export function CardDeck({
  token,
  lessonId,
  cards,
  initiallyViewed,
}: {
  token: string;
  lessonId: string;
  cards: CardItem[];
  initiallyViewed: boolean;
}) {
  const t = useTranslations("student");
  const tc = useTranslations("common");
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(initiallyViewed);
  const touchStart = useRef<number | null>(null);
  const marked = useRef(initiallyViewed);

  const card = cards[index];
  const last = index === cards.length - 1;

  const markComplete = async () => {
    if (marked.current) return;
    marked.current = true;
    setCompleted(true);
    await fetch(`/api/s/${encodeURIComponent(token)}/lessons/${lessonId}/deck-view`, { method: "POST" }).catch(() => undefined);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setIndex((current) => Math.min(cards.length - 1, current + 1));
        setRevealed(false);
      } else if (event.key === "ArrowLeft") {
        setIndex((current) => Math.max(0, current - 1));
        setRevealed(false);
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setRevealed((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length]);

  if (!card) return <p className="text-sm text-muted-foreground">{t("unavailable")}</p>;

  return (
    <div className="space-y-4" data-testid="card-deck">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t("deckProgress", { current: index + 1, total: cards.length })}</span>
        {completed ? <span className="text-emerald-700">{t("completed")}</span> : null}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => setRevealed((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            setRevealed((value) => !value);
          }
        }}
        onTouchStart={(event) => {
          touchStart.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          const end = event.changedTouches[0]?.clientX ?? null;
          if (start === null || end === null) return;
          if (start - end > 50) {
            setIndex((current) => Math.min(cards.length - 1, current + 1));
            setRevealed(false);
          } else if (end - start > 50) {
            setIndex((current) => Math.max(0, current - 1));
            setRevealed(false);
          }
          touchStart.current = null;
        }}
        className="min-h-72 cursor-pointer rounded-3xl border bg-gradient-to-br from-card to-secondary/40 p-8 shadow-sm transition-transform active:scale-[0.99]"
        data-testid="card-face"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {revealed ? t("correctAnswer") : t("reveal")}
        </p>
        <p className="mt-4 break-words text-xl font-semibold leading-relaxed" data-testid="card-text">
          {revealed ? card.answer : card.prompt}
        </p>
        <p className="mt-8 inline-flex items-center gap-2 text-sm text-primary">
          {revealed ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          {revealed ? t("hide") : t("reveal")}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="outline"
          disabled={index === 0}
          onClick={() => {
            setIndex((current) => Math.max(0, current - 1));
            setRevealed(false);
          }}
          aria-label={tc("previous")}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {tc("previous")}
        </Button>
        <Button
          variant="outline"
          disabled={!last}
          onClick={() => {
            if (last) void markComplete();
          }}
        >
          {t("finish")}
        </Button>
        <Button
          disabled={last}
          onClick={() => {
            setIndex((current) => Math.min(cards.length - 1, current + 1));
            setRevealed(false);
          }}
          aria-label={tc("next")}
        >
          {tc("next")}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">← → · Space</p>
    </div>
  );
}
