// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LessonRubric } from "@/components/student/lesson-rubric";
import type { StudentRubric } from "@/server/student/lesson-data";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const rubric: StudentRubric = {
  criteria: [
    { id: "c1", title: "Understanding", description: "Explains the key ideas." },
    { id: "c2", title: "Application", description: "Applies ideas to new questions." },
  ],
  levels: [
    { id: "l1", label: "Excellent", description: "Consistent and accurate." },
    { id: "l2", label: "Developing", description: "Needs more practice." },
  ],
  fallback: false,
};

afterEach(() => cleanup());

describe("student lesson rubric", () => {
  it("renders criteria, levels, and the informational note", () => {
    render(<LessonRubric rubric={rubric} />);

    expect(screen.getByTestId("lesson-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubricTitle")).toBeInTheDocument();
    expect(screen.getByText("rubricGuidance")).toBeInTheDocument();
    expect(screen.getByText("Understanding")).toBeInTheDocument();
    expect(screen.getByText("Explains the key ideas.")).toBeInTheDocument();
    expect(screen.getByText("Excellent")).toBeInTheDocument();
    expect(screen.getByText("Consistent and accurate.")).toBeInTheDocument();
  });

  it("shows the fallback notice when the rubric is shown in the primary locale", () => {
    render(<LessonRubric rubric={{ ...rubric, fallback: true }} />);
    expect(screen.getByText("fallbackNotice")).toBeInTheDocument();
  });
});
