// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Questionnaire } from "@/components/student/questionnaire";
import type { QuestionnaireResult, StudentQuestion } from "@/server/student/lesson-data";
import en from "../messages/en.json";

const questions: StudentQuestion[] = [
  {
    id: "q1",
    type: "MULTIPLE_CHOICE",
    prompt: "Question one",
    options: [
      { id: "a", text: "Option A" },
      { id: "b", text: "Option B" },
    ],
  },
];

function result(classSummary: QuestionnaireResult["classSummary"]): QuestionnaireResult {
  return {
    attemptId: "attempt-1",
    score: 1,
    maxScore: 1,
    percentage: 75,
    passed: true,
    durationMs: 1000,
    completedAt: new Date().toISOString(),
    feedback: [],
    classSummary,
  };
}

function renderResult(classSummary: QuestionnaireResult["classSummary"]) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Questionnaire
        token="token"
        lessonId="lesson"
        questions={questions}
        locale="en"
        initialAnswers={{}}
        existingResult={result(classSummary)}
        canRetake={false}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("questionnaire class summary", () => {
  it("renders aggregate stats and highlights the current band", () => {
    renderResult({
      attempts: 4,
      average: 61,
      highest: 100,
      lowest: 20,
      distribution: [
        { band: "0-19", count: 0 },
        { band: "20-39", count: 1 },
        { band: "40-59", count: 1 },
        { band: "60-79", count: 1 },
        { band: "80-100", count: 1 },
      ],
      currentBand: "60-79",
    });

    const panel = screen.getByTestId("quiz-class-summary");
    expect(within(panel).getByText("Attempts: 4")).toBeInTheDocument();
    expect(within(panel).getByText("61%")).toBeInTheDocument();
    expect(within(panel).getByText("100%")).toBeInTheDocument();
    expect(within(panel).getByText("20%")).toBeInTheDocument();
    expect(screen.getByTestId("quiz-band-60-79")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("quiz-band-80-100")).toHaveAttribute("data-active", "false");
  });

  it("shows the not-enough-results state without a summary", () => {
    renderResult(null);
    const panel = screen.getByTestId("quiz-class-summary");
    expect(within(panel).getByText("Not enough class results yet.")).toBeInTheDocument();
  });

  it("does not celebrate when loading an already-completed result", () => {
    renderResult(null);
    expect(screen.queryByTestId("quiz-celebration")).not.toBeInTheDocument();
  });
});

describe("questionnaire celebration", () => {
  it("celebrates a fresh submission and again after a retake", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ blocked: false, result: result(null) }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Questionnaire
          token="token"
          lessonId="lesson"
          questions={questions}
          locale="en"
          initialAnswers={{}}
          existingResult={null}
          canRetake
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByTestId("quiz-option-a"));
    fireEvent.click(screen.getByTestId("quiz-submit"));
    await waitFor(() => expect(screen.getByTestId("quiz-celebration")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Start quiz" }));
    await waitFor(() => expect(screen.queryByTestId("quiz-celebration")).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId("quiz-option-a"));
    fireEvent.click(screen.getByTestId("quiz-submit"));
    await waitFor(() => expect(screen.getByTestId("quiz-celebration")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
