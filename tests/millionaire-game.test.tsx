// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MillionaireGame } from "@/components/student/millionaire-game";
import en from "../messages/en.json";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
const sound = vi.hoisted(() => ({
  toggleMute: vi.fn(),
  startAmbience: vi.fn(),
  stopAmbience: vi.fn(),
  playTone: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: navigation.refresh }),
}));

vi.mock("@/components/student/use-student-sound", () => ({
  useStudentSound: () => ({ muted: false, ...sound }),
}));

vi.mock("framer-motion", () => ({
  useReducedMotion: () => true,
  motion: {
    div: ({ children, initial, animate, ...props }: { children?: ReactNode; initial?: unknown; animate?: unknown } & Record<string, unknown>) => {
      void initial;
      void animate;
      return <div {...props}>{children}</div>;
    },
  },
}));

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function activeState(overrides: Record<string, unknown> = {}) {
  return {
    status: "ACTIVE",
    attemptId: "attempt-1",
    score: 0,
    level: 0,
    total: 2,
    lifelines: { fiftyFifty: false, askAudience: false },
    question: {
      id: "q1",
      type: "MULTIPLE_CHOICE",
      prompt: "Question one",
      options: [
        { id: "a", text: "Option A" },
        { id: "b", text: "Option B" },
      ],
    },
    ...overrides,
  };
}

function renderGame() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MillionaireGame token="token" lessonId="lesson-1" locale="en" hasQuestions />
    </NextIntlClientProvider>,
  );
}

async function startGame() {
  fireEvent.click(screen.getByTestId("game-start"));
  await screen.findByTestId("game-question");
}

beforeEach(() => {
  fetchMock.mockReset();
  navigation.refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("millionaire game failures", () => {
  it("starts a game with the server-provided question", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { state: activeState() }));
    renderGame();
    await startGame();

    expect(screen.getByTestId("game-question")).toHaveTextContent("Question one");
    expect(screen.getByTestId("game-score")).toHaveTextContent("0");
  });

  it("asks the student to re-enter their name when the start response is unauthorized", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 401 }));
    renderGame();
    fireEvent.click(screen.getByTestId("game-start"));

    expect(await screen.findByTestId("game-session-expired")).toHaveTextContent(en.student.gameSessionExpired);
    expect(screen.getByTestId("game-reenter-name")).toHaveAttribute("href", "/en/s/token");
    expect(screen.queryByTestId("game-question")).not.toBeInTheDocument();
    expect(screen.queryByText(en.student.unavailable)).not.toBeInTheDocument();
  });

  it("reports a lesson that is still being prepared and refreshes the lesson data once", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: { code: "not_ready" } }));
    renderGame();
    fireEvent.click(screen.getByTestId("game-start"));

    expect(await screen.findByTestId("game-not-ready")).toHaveTextContent(en.student.gameNotReady);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("game-retry")).toBeDisabled();
    expect(screen.queryByText(en.student.unavailable)).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("game-retry")).not.toBeDisabled());
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { state: activeState() }));
    fireEvent.click(screen.getByTestId("game-retry"));

    expect(await screen.findByTestId("game-question")).toHaveTextContent("Question one");
  });

  it("stops offering a start action when the lesson has no game questions", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: { code: "no_game" } }));
    renderGame();
    fireEvent.click(screen.getByTestId("game-start"));

    expect(await screen.findByTestId("game-no-questions")).toHaveTextContent(en.student.gameNoQuestions);
    expect(screen.queryByTestId("game-start")).not.toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the start action available after an unexpected server failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: { code: "internal_error" } }));
    renderGame();
    fireEvent.click(screen.getByTestId("game-start"));

    expect(await screen.findByText(en.student.gameUnexpected)).toBeInTheDocument();
    expect(screen.getByTestId("game-start")).toBeEnabled();
    expect(screen.queryByText(en.student.unavailable)).not.toBeInTheDocument();
  });

  it("reports a network failure as retryable instead of missing content", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    renderGame();
    fireEvent.click(screen.getByTestId("game-start"));

    expect(await screen.findByText(en.student.gameUnexpected)).toBeInTheDocument();
    expect(screen.getByTestId("game-start")).toBeEnabled();
    expect(screen.queryByText(en.student.unavailable)).not.toBeInTheDocument();
  });

  it("shows the session recovery action when an answer is rejected as unauthorized", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { state: activeState() }))
      .mockResolvedValueOnce(new Response("not json", { status: 401 }));
    renderGame();
    await startGame();

    fireEvent.click(screen.getByTestId("game-option-a"));

    expect(await screen.findByTestId("game-session-expired")).toHaveTextContent(en.student.gameSessionExpired);
    expect(screen.getByTestId("game-reenter-name")).toHaveAttribute("href", "/en/s/token");
    expect(screen.queryByTestId("game")).not.toBeInTheDocument();
  });

  it("moves to a new-game action when the server reports the game ended", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { state: activeState() }))
      .mockResolvedValueOnce(jsonResponse(409, { error: { code: "game_ended" } }));
    renderGame();
    await startGame();

    fireEvent.click(screen.getByTestId("game-option-a"));

    expect(await screen.findByTestId("game-ended-notice")).toHaveTextContent(en.student.gameEnded);
    expect(screen.queryByTestId("game-question")).not.toBeInTheDocument();
    expect(screen.queryByText(en.student.unavailable)).not.toBeInTheDocument();
  });

  it("keeps the current question and score when an answer fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { state: activeState() }))
      .mockResolvedValueOnce(jsonResponse(500, { error: { code: "internal_error" } }));
    renderGame();
    await startGame();

    fireEvent.click(screen.getByTestId("game-option-a"));

    expect(await screen.findByText(en.student.gameUnexpected)).toBeInTheDocument();
    expect(screen.getByTestId("game-question")).toHaveTextContent("Question one");
    expect(screen.getByTestId("game-score")).toHaveTextContent("0");
    expect(screen.getByTestId("game-option-a")).toBeEnabled();
  });

  it("keeps the lifelines unchanged when a lifeline request fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { state: activeState() }))
      .mockResolvedValueOnce(jsonResponse(500, { error: { code: "internal_error" } }));
    renderGame();
    await startGame();

    fireEvent.click(screen.getByTestId("game-fifty"));

    expect(await screen.findByText(en.student.gameUnexpected)).toBeInTheDocument();
    expect(screen.getByTestId("game-fifty")).toBeEnabled();
    expect(screen.getByTestId("game-audience")).toBeEnabled();
    expect(screen.getByTestId("game-question")).toHaveTextContent("Question one");
  });
});
