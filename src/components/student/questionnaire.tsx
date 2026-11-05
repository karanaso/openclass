"use client";

import { CheckCircle2, ChevronLeft, ChevronRight, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QuestionnaireResult, StudentQuestion } from "@/server/student/lesson-data";

type Props = {
  token: string;
  lessonId: string;
  questions: StudentQuestion[];
  locale: "el" | "en";
  initialAnswers: Record<string, string>;
  existingResult: QuestionnaireResult | null;
  canRetake: boolean;
};

export function Questionnaire({
  token,
  lessonId,
  questions,
  locale,
  initialAnswers,
  existingResult,
  canRetake,
}: Props) {
  const t = useTranslations("student");
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [current, setCurrent] = useState(0);
  const [result, setResult] = useState<QuestionnaireResult | null>(existingResult);
  const [showResult, setShowResult] = useState(Boolean(existingResult && !canRetake));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const idempotencyKey = useRef(`quiz-${lessonId}-${Math.random().toString(36).slice(2)}-${Date.now()}`);

  const question = questions[current];
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);

  useEffect(() => {
    if (showResult || answeredCount === 0) return;
    const timer = setTimeout(() => {
      void fetch(`/api/s/${encodeURIComponent(token)}/lessons/${lessonId}/questionnaire/draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers, locale }),
      }).catch(() => undefined);
    }, 800);
    return () => clearTimeout(timer);
  }, [answers, answeredCount, lessonId, locale, showResult, token]);

  if (questions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("unavailable")}</p>;
  }

  async function submit() {
    const unanswered = questions.length - answeredCount;
    if (unanswered > 0 && !window.confirm(t("unansweredWarning"))) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/s/${encodeURIComponent(token)}/lessons/${lessonId}/questionnaire/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId })),
          durationMs: Date.now() - startedAt.current,
          idempotencyKey: idempotencyKey.current,
          locale,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(t("unavailable"));
        return;
      }
      setResult(data.result);
      setShowResult(true);
    } catch {
      setError(t("unavailable"));
    } finally {
      setSubmitting(false);
    }
  }

  function retake() {
    setAnswers({});
    setResult(null);
    setShowResult(false);
    setCurrent(0);
    startedAt.current = Date.now();
    idempotencyKey.current = `quiz-${lessonId}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }

  if (showResult && result) {
    const questionById = new Map(questions.map((item) => [item.id, item]));
    return (
      <div className="space-y-4" data-testid="quiz-result">
        <div className="rounded-2xl border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("resultTitle")}</p>
          <p className="mt-2 text-4xl font-black">
            {result.score}/{result.maxScore}
          </p>
          <p className="mt-1 text-lg font-semibold">{result.percentage}%</p>
          <Badge variant={result.passed ? "success" : "destructive"} className="mt-3">
            {result.passed ? t("passed") : t("failed")}
          </Badge>
          {canRetake ? (
            <div className="mt-4">
              <Button variant="outline" onClick={retake}>
                {t("startQuiz")}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          {result.feedback.map((item) => {
            const prompt = questionById.get(item.questionId);
            const selected = prompt?.options.find((option) => option.id === item.selectedOptionId);
            const correct = prompt?.options.find((option) => option.id === item.correctOptionId);
            return (
              <div key={item.questionId} className="rounded-xl border bg-card p-4">
                <div className="flex items-start gap-2">
                  {item.isCorrect ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                  ) : (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
                  )}
                  <div className="space-y-2">
                    <p className="font-medium">{prompt?.prompt}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("yourAnswer")}: {selected?.text ?? "—"}
                    </p>
                    {!item.isCorrect ? (
                      <p className="text-sm text-emerald-700">
                        {t("correctAnswer")}: {correct?.text}
                      </p>
                    ) : null}
                    <p className="text-sm">{item.explanation}</p>
                    <p className="text-xs text-muted-foreground">{t("sourcePage", { page: item.sourcePage })}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="quiz">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t("questionOf", { current: current + 1, total: questions.length })}</span>
        <span>
          {answeredCount}/{questions.length}
        </span>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <p className="text-lg font-semibold" data-testid="quiz-question">
          {question.prompt}
        </p>
        <div className="mt-5 grid gap-2">
          {question.options.map((option) => {
            const selected = answers[question.id] === option.id;
            return (
              <button
                key={option.id}
                type="button"
                data-testid={`quiz-option-${option.id}`}
                onClick={() => setAnswers((currentAnswers) => ({ ...currentAnswers, [question.id]: option.id }))}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  selected ? "border-primary bg-primary/10" : "hover:bg-secondary"
                }`}
              >
                <span className="mr-3 inline-grid h-6 w-6 place-items-center rounded-full border text-xs font-bold">
                  {option.id.toUpperCase()}
                </span>
                {option.text}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" disabled={current === 0} onClick={() => setCurrent((value) => Math.max(0, value - 1))}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {t("tabs.quiz")}
        </Button>
        {current < questions.length - 1 ? (
          <Button onClick={() => setCurrent((value) => Math.min(questions.length - 1, value + 1))}>
            {t("next")}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button variant="accent" onClick={submit} disabled={submitting} data-testid="quiz-submit">
            {submitting ? t("submitting") : t("submit")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1" aria-label={t("review")}>
        {questions.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setCurrent(index)}
            className={`h-8 w-8 rounded-md border text-xs font-semibold ${
              index === current
                ? "border-primary bg-primary text-primary-foreground"
                : answers[item.id]
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "bg-card"
            }`}
            aria-label={`${index + 1}`}
          >
            {index + 1}
          </button>
        ))}
      </div>

      {current === questions.length - 1 ? null : (
        <Button className="w-full" variant="accent" onClick={submit} disabled={submitting} data-testid="quiz-submit">
          {submitting ? t("submitting") : t("submit")}
        </Button>
      )}
    </div>
  );
}
