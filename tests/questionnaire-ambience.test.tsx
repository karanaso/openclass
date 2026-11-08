// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Questionnaire } from "@/components/student/questionnaire";
import { MUTE_STORAGE_KEY } from "@/components/student/use-student-sound";
import type { StudentQuestion } from "@/server/student/lesson-data";

const howlerMock = vi.hoisted(() => {
  class MockHowl {
    static instances: MockHowl[] = [];
    options: Record<string, unknown>;
    playingValue = false;
    play = vi.fn(() => {
      this.playingValue = true;
      return 1;
    });
    pause = vi.fn(() => {
      this.playingValue = false;
    });
    stop = vi.fn(() => {
      this.playingValue = false;
    });
    playing = vi.fn(() => this.playingValue);
    volume = vi.fn();
    fade = vi.fn();
    unload = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      MockHowl.instances.push(this);
    }
  }

  return { MockHowl };
});

vi.mock("howler", () => ({ Howl: howlerMock.MockHowl }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const questions: StudentQuestion[] = [
  {
    id: "q1",
    type: "MULTIPLE_CHOICE",
    prompt: "Question one",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
      { id: "d", text: "D" },
    ],
  },
  {
    id: "q2",
    type: "MULTIPLE_CHOICE",
    prompt: "Question two",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
      { id: "d", text: "D" },
    ],
  },
];

function renderQuiz() {
  return render(
    <Questionnaire
      token="token"
      lessonId="lesson"
      questions={questions}
      locale="en"
      initialAnswers={{}}
      existingResult={null}
      canRetake
    />,
  );
}

beforeEach(() => {
  howlerMock.MockHowl.instances.length = 0;
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Questionnaire ambience", () => {
  it("starts muted when the game stored a muted preference", () => {
    window.localStorage.setItem(MUTE_STORAGE_KEY, "1");
    renderQuiz();

    expect(screen.getByTestId("quiz-mute")).toHaveAttribute("aria-label", "unmute");

    fireEvent.pointerDown(screen.getByTestId("quiz"));
    expect(howlerMock.MockHowl.instances).toHaveLength(0);
  });

  it("unmuting in the quiz starts ambience and persists the preference", () => {
    window.localStorage.setItem(MUTE_STORAGE_KEY, "1");
    renderQuiz();

    fireEvent.pointerDown(screen.getByTestId("quiz"));
    fireEvent.click(screen.getByTestId("quiz-mute"));

    expect(window.localStorage.getItem(MUTE_STORAGE_KEY)).toBe("0");
    const howl = howlerMock.MockHowl.instances[0];
    expect(howl).toBeDefined();
    expect(howl.play).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("quiz-mute")).toHaveAttribute("aria-label", "mute");
  });

  it("starts ambience on the first quiz interaction when sound is enabled", () => {
    renderQuiz();

    fireEvent.pointerDown(screen.getByTestId("quiz-option-a"));

    const howl = howlerMock.MockHowl.instances[0];
    expect(howl).toBeDefined();
    expect(howl.play).toHaveBeenCalledTimes(1);
    expect(howl.fade).toHaveBeenCalledWith(0, 0.16, 800, 1);
  });
});
