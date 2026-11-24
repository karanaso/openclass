"use client";

import { motion, useReducedMotion } from "framer-motion";
import { HelpCircle, Trophy, Users, Volume2, VolumeX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { BalloonCelebration } from "./balloon-celebration";
import { readGameFailure, UNEXPECTED_GAME_FAILURE, type GameFailure } from "./game-failure";
import { useStudentSound } from "./use-student-sound";

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
  const pageLocale = useLocale();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<GameState | null>(null);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; correctOptionId: string; explanation: string; sourcePage: number } | null>(null);
  const [removedOptions, setRemovedOptions] = useState<string[]>([]);
  const [audience, setAudience] = useState<Record<string, number> | null>(null);
  const [failure, setFailure] = useState<GameFailure | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const { muted, toggleMute, startAmbience, stopAmbience, playTone } = useStudentSound();

  function refreshLessonData() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 600);
  }

  function handleFailure(next: GameFailure) {
    setFailure(next);
    if (next.kind === "not_ready" || next.kind === "no_questions") refreshLessonData();
  }

  function retry() {
    setFailure(null);
    if (!state) void start();
  }

  async function start() {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch(`/api/s/${encodeURIComponent(token)}/lessons/${lessonId}/game/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!response.ok) {
        handleFailure(await readGameFailure(response));
        return;
      }
      const data = await response.json();
      setState(data.state);
      setFeedback(null);
      setRemovedOptions([]);
      setAudience(null);
      if (data.state.status === "ACTIVE") {
        startAmbience();
        playTone(440);
      }
    } catch {
      handleFailure(UNEXPECTED_GAME_FAILURE);
    } finally {
      setLoading(false);
    }
  }

  async function answer(optionId: string) {
    if (!state || state.status !== "ACTIVE" || !state.question || feedback) return;
    setLoading(true);
    setFailure(null);
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
      if (!response.ok) {
        handleFailure(await readGameFailure(response));
        return;
      }
      const data = await response.json();
      setFeedback(data.result);
      playTone(data.result.isCorrect ? 660 : 180, 0.3, data.result.isCorrect ? "sine" : "sawtooth");
      const delay = reduceMotion ? 0 : 1400;
      window.setTimeout(() => {
        setState(data.state);
        setFeedback(null);
        setRemovedOptions([]);
        setAudience(null);
        if (data.state.status === "ACTIVE") playTone(440);
        if (data.state.status === "COMPLETED") {
          stopAmbience();
          playTone(523);
          window.setTimeout(() => playTone(659), 150);
          window.setTimeout(() => playTone(784), 300);
        } else if (data.state.status === "ENDED") {
          stopAmbience();
        }
      }, delay);
    } catch {
      handleFailure(UNEXPECTED_GAME_FAILURE);
    } finally {
      setLoading(false);
    }
  }

  async function lifeline(kind: "fiftyFifty" | "askAudience") {
    if (!state || state.status !== "ACTIVE") return;
    setFailure(null);
    try {
      const response = await fetch(`/api/s/${encodeURIComponent(token)}/lessons/${lessonId}/game/lifeline`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptId: state.attemptId, lifeline: kind, locale }),
      });
      if (!response.ok) {
        handleFailure(await readGameFailure(response));
        return;
      }
      const data = await response.json();
      setState((current) => (current && current.status === "ACTIVE" ? { ...current, lifelines: data.lifelines } : current));
      if (kind === "fiftyFifty") {
        setRemovedOptions(data.removedOptionIds ?? []);
        playTone(300, 0.2, "triangle");
      } else {
        setAudience(data.distribution ?? {});
        playTone(520, 0.2, "triangle");
      }
    } catch {
      handleFailure(UNEXPECTED_GAME_FAILURE);
    }
  }

  if (!hasQuestions) {
    return (
      <p className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground" data-testid="game-no-questions">
        {t("gameNoQuestions")}
      </p>
    );
  }

  if (failure?.kind === "session") {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed bg-card p-10 text-center" data-testid="game-session-expired">
        <p className="text-muted-foreground">{t("gameSessionExpired")}</p>
        <a
          href={`/${pageLocale}/s/${encodeURIComponent(token)}`}
          data-testid="game-reenter-name"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t("gameReenterName")}
        </a>
      </div>
    );
  }

  if (failure?.kind === "not_ready") {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed bg-card p-10 text-center" data-testid="game-not-ready">
        <p className="text-muted-foreground">{t("gameNotReady")}</p>
        <Button onClick={retry} disabled={loading || refreshing} data-testid="game-retry">
          {t("gameRetry")}
        </Button>
      </div>
    );
  }

  if (failure?.kind === "no_questions") {
    return (
      <p className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground" data-testid="game-no-questions">
        {t("gameNoQuestions")}
      </p>
    );
  }

  if (failure?.kind === "ended") {
    return (
      <div className="space-y-3 text-center" data-testid="game-ended-notice">
        <Alert variant="warning">{t("gameEnded")}</Alert>
        <Button onClick={start} disabled={loading}>
          {t("playAgain")}
        </Button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="space-y-4 text-center">
        {failure ? <Alert variant="error">{t("gameUnexpected")}</Alert> : null}
        <div className="rounded-3xl border bg-gradient-to-br from-amber-50 to-card p-10 dark:from-amber-500/10">
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
      <div className="space-y-4 text-center" data-testid="game-expired">
        <Alert variant="warning">{t("gameExpired")}</Alert>
        <Button onClick={start} disabled={loading}>
          {t("playAgain")}
        </Button>
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
                  <p className="text-emerald-700 dark:text-emerald-300">
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
    return (
      <div className="space-y-3 text-center" data-testid="game-missing-question">
        <Alert variant="error">{t("gameUnexpected")}</Alert>
        <Button onClick={start} disabled={loading}>
          {t("gameRetry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="game">
      <BalloonCelebration />
      {failure ? <Alert variant="error">{t("gameUnexpected")}</Alert> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t("questionOf", { current: activeState.level + 1, total: activeState.total })}</Badge>
          <Badge variant="default" data-testid="game-score">
            {t("score")}: {activeState.score}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={toggleMute}
          aria-label={muted ? t("unmute") : t("mute")}
          data-testid="game-mute"
        >
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
              className={`rounded-xl border p-4 ${
                feedback.isCorrect
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                  : "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10"
              }`}
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
