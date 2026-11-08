// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuizCelebration } from "@/components/student/quiz-celebration";

const { reducedMotion } = vi.hoisted(() => ({ reducedMotion: { value: false } }));

vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: () => reducedMotion.value };
});

afterEach(() => {
  reducedMotion.value = false;
});

describe("QuizCelebration", () => {
  it("renders the label and particle burst when motion is allowed", () => {
    reducedMotion.value = false;
    render(<QuizCelebration active label="Assessment complete!" />);
    expect(screen.getByTestId("quiz-celebration")).toHaveTextContent("Assessment complete!");
    expect(screen.getByTestId("quiz-celebration-particles")).toBeInTheDocument();
  });

  it("keeps the static label but renders no particles when reduced motion is requested", () => {
    reducedMotion.value = true;
    render(<QuizCelebration active label="Assessment complete!" />);
    expect(screen.getByTestId("quiz-celebration")).toHaveTextContent("Assessment complete!");
    expect(screen.queryByTestId("quiz-celebration-particles")).not.toBeInTheDocument();
  });

  it("renders nothing when inactive", () => {
    render(<QuizCelebration active={false} label="Assessment complete!" />);
    expect(screen.queryByTestId("quiz-celebration")).not.toBeInTheDocument();
  });
});
