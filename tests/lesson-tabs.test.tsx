// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonTabs } from "@/components/student/lesson-tabs";
import type { StudentLessonData } from "@/server/student/lesson-data";

const { replace, state } = vi.hoisted(() => ({
  replace: vi.fn(),
  state: { params: new URLSearchParams() },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key.split(".").pop() ?? key,
  useLocale: () => "en",
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => state.params,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  usePathname: () => "/en/s/token/lesson/lesson-1",
}));

vi.mock("@/components/student/pdf-viewer", () => ({
  PdfViewer: ({ url }: { url: string }) => <div data-testid="pdf-viewer-mock">{url}</div>,
}));

vi.mock("@/components/student/card-deck", () => ({
  CardDeck: () => <div data-testid="card-deck-mock" />,
}));

vi.mock("@/components/student/millionaire-game", () => ({
  MillionaireGame: () => <div data-testid="game-mock" />,
}));

vi.mock("@/components/student/questionnaire", () => ({
  Questionnaire: () => <div data-testid="quiz-mock" />,
}));

function data(sourceDocument: StudentLessonData["sourceDocument"]): StudentLessonData {
  return {
    lesson: {
      id: "lesson-1",
      title: "Photosynthesis",
      classId: "class-1",
      className: "Biology",
      status: "READY",
      sourceLocale: "el",
      retakeEnabled: false,
      passThreshold: 60,
    },
    cards: [{ id: "card-1", prompt: "Question", answer: "Answer" }],
    questionnaire: [],
    game: [],
    videos: [],
    sourceDocument,
    existingResult: null,
    draftAnswers: {},
    deckViewed: false,
    fallbackUsed: false,
    contentLocale: "en",
    primaryLocale: "el",
  };
}

beforeEach(() => {
  replace.mockReset();
  state.params = new URLSearchParams();
});

afterEach(() => {
  cleanup();
});

describe("lesson tabs", () => {
  it("renders the PDF tab first and selects it by default", () => {
    render(
      <LessonTabs
        token="token"
        studentName="Maria"
        data={data({ url: "/api/s/token/lessons/lesson-1/source", filename: "lesson.pdf" })}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("data-testid"))).toEqual(["tab-pdf", "tab-cards"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("pdf-viewer-mock")).toHaveTextContent(
      "/api/s/token/lessons/lesson-1/source",
    );

    fireEvent.click(screen.getByTestId("tab-cards"));
    expect(screen.getByTestId("tab-cards")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("tab-pdf")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("card-deck-mock")).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("tab=cards"), { scroll: false });
  });

  it("respects an explicit tab deep link over the PDF default", () => {
    state.params = new URLSearchParams("tab=cards");
    render(
      <LessonTabs
        token="token"
        studentName="Maria"
        data={data({ url: "/api/s/token/lessons/lesson-1/source", filename: "lesson.pdf" })}
      />,
    );

    expect(screen.getByTestId("tab-cards")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("tab-pdf")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("card-deck-mock")).toBeInTheDocument();
  });

  it("hides the PDF tab and opens Cards when no source document is available", () => {
    render(<LessonTabs token="token" studentName="Maria" data={data(null)} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("data-testid"))).toEqual(["tab-cards"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByTestId("tab-pdf")).not.toBeInTheDocument();
    expect(screen.getByTestId("card-deck-mock")).toBeInTheDocument();
    expect(screen.queryByTestId("pdf-viewer-mock")).not.toBeInTheDocument();
  });
});
