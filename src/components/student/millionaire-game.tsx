"use client";

import { motion, useReducedMotion } from "framer-motion";
import { HelpCircle, Trophy, Users, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Option = { id: string; text: string };
type Question = { id: string; type: string; prompt: string; options: Option[] };
type Lifelines = { fiftyFifty: boolean; askAudience: boolean };
type ReviewItem = {
  questionId: string;
  prompt: string;
  options: Option[];
  selectedOptionId: string | null;
  correctOptionId: string;
  isCorrect: boolean;
  explanation: string;
  sourcePage: number;
};
type ActiveState = {
  status: "ACTIVE";
  attemptId: string;
  score: number;
  level: number;
  total: number;
  lifelines: Lifelines;
  question: Question | null;
};
type EndedState = {
  status: "ENDED" | "COMPLETED";
  attemptId: string;
  score: number;
  total: number;
  percentage: number;
  passed: boolean;
  lifelines: Lifelines;
  review: ReviewItem[];
};
type ExpiredState = { status: "EXPIRED"; attemptId: string };
type GameState = ActiveState | EndedState | ExpiredState;

export function MillionaireGame({
  token,
  lessonId,
  locale,
  hasQuestions,
}: {
  token: string;
  lessonId: string;
  locale: "el" | "en";
  hasQuestions: boolean;
}) {
  const t = useTranslations("student");
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<GameState | null>(null);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; correctOptionId: string; explanation: string; sourcePage: number } | null>(null);
  const [removedOptions, setRemovedOptions] = useState<string[]>([]);
  const [audience, setAudience] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    setMuted(window.localStorage.getItem("lessonlab:muted") === "1");
  }, []);

  useEffect(() => {
    return () => {
      void audio.current?.close();
    };
  }, []);

  function tone(frequency: number, duration = 0.15, type: OscillatorType = "sine") {
    if (muted) return;
    try {
      audio.current ??= new AudioContext();
      const context = audio.current;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.06, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch {
      // audio is optional
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    window.localStorage.setItem("lessonlab:muted", next ? "1" : "0");
  }

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/s/${encodeURIComponent(token)}/lessons/${lessonId}/game/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(t("unavailable"));
        return;
      }
      setState(data.state);
      setFeedback(null);
      setRemovedOptions([]);
      setAudience(null);
      if (data.state.status === "ACTIVE") tone(440);
    } catch {
      setError(t("unavailable"));
    } finally {
      setLoading(false);
    }
  }

  async function answer(optionId: string) {
    if (!state || state.status !== "ACTIVE" || !state.question || feedback) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/s/${encodeURIComponent(token)}/lessons/${lessonId}/game/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attemptId: state.attemptId,
          questionId: state.question.id,
          optionId,
          locale,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(t("unavailable"));
        return;
      }
      setFeedback(data.result);
      tone(data.result.isCorrect ? 660 : 180, 0.3, data.result.isCorrect ? "sine" : "sawtooth");
      const delay = reduceMotion ? 0 : 1400;
      window.setTimeout(() => {
        setState(data.state);
        setFeedback(null);
        setRemovedOptions([]);
        setAudience(null);
        if (data.state.status === "ACTIVE") tone(440);
        if (data.state.status === "COMPLETED") {
          tone(523);
          window.setTimeout(() => tone(659), 150);
          window.setTimeout(() => tone(784), 300);
        }
      }, delay);
    } catch {
      setError(t("unavailable"));
    } finally {
      setLoading(false);
    }
  }

  async function lifeline(kind: "fiftyFifty" | "askAudience") {
    if (!state || state.status !== "ACTIVE") return;
    try {
      const response = await fetch(`/api/s/${encodeURIComponent(token)}/lessons/${lessonId}/game/lifeline`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptId: state.attemptId, lifeline: kind, locale }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(t("unavailable"));
        return;
      }
      setState((current) => (current && current.status === "ACTIVE" ? { ...current, lifelines: data.lifelines } : current));
      if (kind === "fiftyFifty") {
        setRemovedOptions(data.removedOptionIds ?? []);
        tone(300, 0.2, "triangle");
      } else {
        setAudience(data.distribution ?? {});
        tone(520, 0.2, "triangle");
      }
    } catch {
      setError(t("unavailable"));
    }
  }

  if (!hasQuestions) {
    return <p className="text-sm text-muted-foreground">{t("unavailable")}</p>;
  }

  if (!state) {
    return (
      <div className="space-y-4 text-center">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <div className="rounded-3xl border bg-gradient-to-br from-amber-50 to-card p-10">
          <Trophy className="mx-auto h-12 w-12 text-amber-500" aria-hidden />
          <h2 className="mt-4 text-2xl font-black">{t("startGame")}</h2>
          <Button size="lg" variant="accent" className="mt-6" onClick={start} disabled={loading} data-testid="game-start">
            {t("startGame")}
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "EXPIRED") {
    return (
      <div className="space-y-4 text-center">
        <Alert variant="warning">{t("unavailable")}</Alert>
        <Button onClick={start}>{t("startGame")}</Button>
      </div>
    );
  }

  if (state.status === "ENDED" || state.status === "COMPLETED") {
    return (
      <div className="space-y-4" data-testid="game-ended">
        <div className="rounded-3xl border bg-card p-8 text-center">
          <Trophy className={`mx-auto h-12 w-12 ${state.status === "COMPLETED" ? "text-amber-500" : "text-muted-foreground"}`} aria-hidden />
          <p className="mt-3 text-sm text-muted-foreground">{state.status === "COMPLETED" ? t("youWon") : t("gameOver")}</p>
          <p className="mt-1 text-4xl font-black">
            {state.score}/{state.total}
          </p>
          <p className="mt-1 text-lg">{state.percentage}%</p>
          <Button className="mt-5" onClick={start} data-testid="game-play-again">
            {t("playAgain")}
          </Button>
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold">{t("review")}</h3>
          {state.review.map((item) => {
            const selected = item.options.find((option) => option.id === item.selectedOptionId);
            const correct = item.options.find((option) => option.id === item.correctOptionId);
            return (
              <div key={item.questionId} className="rounded-xl border bg-card p-4 text-sm">
                <p className="font-medium">{item.prompt}</p>
                <p className="mt-1 text-muted-foreground">
                  {t("yourAnswer")}: {selected?.text ?? "—"}
                </p>
                {!item.isCorrect ? (
                  <p className="text-emerald-700">
                    {t("correctAnswer")}: {correct?.text}
                  </p>
                ) : null}
                <p className="mt-1">{item.explanation}</p>
                <p className="text-xs text-muted-foreground">{t("sourcePage", { page: item.sourcePage })}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const activeState = state as ActiveState;
  const question = activeState.question;
  if (!question) {
    return <p className="text-sm text-muted-foreground">{t("unavailable")}</p>;
  }

  return (
    <div className="space-y-4" data-testid="game">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t("questionOf", { current: activeState.level + 1, total: activeState.total })}</Badge>
          <Badge variant="default" data-testid="game-score">
            {t("score")}: {activeState.score}
          </Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={toggleMute} aria-label={muted ? t("unmute") : t("mute")}>
          {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
        <div className="space-y-3">
          <motion.div
            key={question.id}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border bg-card p-6"
          >
            <p className="text-lg font-semibold" data-testid="game-question">
              {question.prompt}
            </p>
            <div className="mt-5 grid gap-2">
              {question.options.map((option) => {
                if (removedOptions.includes(option.id)) return null;
                const percentage = audience?.[option.id];
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={loading || Boolean(feedback)}
                    onClick={() => answer(option.id)}
                    data-testid={`game-option-${option.id}`}
                    className="relative overflow-hidden rounded-xl border px-4 py-3 text-left transition-colors hover:bg-secondary disabled:opacity-70"
                  >
                    {percentage !== undefined ? (
                      <span className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${percentage}%` }} aria-hidden />
                    ) : null}
                    <span className="relative">
                      <span className="mr-3 inline-grid h-6 w-6 place-items-center rounded-full border text-xs font-bold">
                        {option.id.toUpperCase()}
                      </span>
                      {option.text}
                      {percentage !== undefined ? <span className="ml-2 text-xs text-muted-foreground">{percentage}%</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {feedback ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`rounded-xl border p-4 ${feedback.isCorrect ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}
            >
              <p className="font-semibold">{feedback.isCorrect ? t("correct") : t("incorrect")}</p>
              <p className="mt-1 text-sm">{feedback.explanation}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("sourcePage", { page: feedback.sourcePage })}</p>
            </motion.div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={activeState.lifelines.fiftyFifty || Boolean(feedback)}
              onClick={() => lifeline("fiftyFifty")}
              data-testid="game-fifty"
            >
              <HelpCircle className="h-4 w-4" aria-hidden />
              {t("fiftyFifty")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={activeState.lifelines.askAudience || Boolean(feedback)}
              onClick={() => lifeline("askAudience")}
              data-testid="game-audience"
            >
              <Users className="h-4 w-4" aria-hidden />
              {t("askAudience")}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t("ladder")}</p>
          <div className="space-y-1">
            {Array.from({ length: activeState.total }, (_, index) => activeState.total - index).map((level) => (
              <div
                key={level}
                className={`rounded-md px-2 py-1 text-xs ${level === activeState.level + 1 ? "bg-accent font-bold" : "text-muted-foreground"}`}
              >
                {level}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
