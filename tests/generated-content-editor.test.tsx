// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import {
  GeneratedContentActions,
  GeneratedContentCounts,
  GeneratedContentEditorProvider,
  useGeneratedContentEditor,
} from "@/components/admin/generated-content-editor";
import type { EditableCard } from "@/components/admin/card-editor";
import type { EditableQuestion } from "@/server/services/questions";
import en from "../messages/en.json";

const createdCard: EditableCard = {
  id: "card-1",
  position: 1,
  sourcePage: 1,
  translations: {
    el: { prompt: "Ερώτηση", answer: "Απάντηση" },
    en: { prompt: "Prompt", answer: "Answer" },
  },
};

const createdQuestion: EditableQuestion = {
  id: "question-1",
  mode: "QUESTIONNAIRE",
  position: 1,
  type: "TRUE_FALSE",
  correctOptionId: "a",
  sourcePage: 1,
  translations: {
    el: {
      prompt: "Ερώτηση",
      options: [
        { id: "a", text: "Σωστό" },
        { id: "b", text: "Λάθος" },
      ],
      explanation: "Εξήγηση",
    },
    en: {
      prompt: "Question",
      options: [
        { id: "a", text: "True" },
        { id: "b", text: "False" },
      ],
      explanation: "Explanation",
    },
  },
};

function Harness() {
  const { activeEditor, registerCardCreated, registerQuestionCreated } = useGeneratedContentEditor();
  return (
    <>
      <GeneratedContentActions />
      <span data-testid="active-editor">{activeEditor ?? "none"}</span>
      <GeneratedContentCounts />
      <button type="button" onClick={() => registerCardCreated(createdCard)}>
        register-card
      </button>
      <button type="button" onClick={() => registerQuestionCreated(createdQuestion)}>
        register-question
      </button>
    </>
  );
}

function renderHarness() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GeneratedContentEditorProvider initialCardCount={2} initialQuestionCount={3}>
        <Harness />
      </GeneratedContentEditorProvider>
    </NextIntlClientProvider>,
  );
}

describe("Generated content editor controls", () => {
  it("toggles one editor at a time and exposes expanded state", () => {
    renderHarness();
    const cardsButton = screen.getByTestId("edit-cards-button");
    const questionsButton = screen.getByTestId("edit-questions-button");

    expect(screen.getByTestId("active-editor")).toHaveTextContent("none");
    expect(cardsButton).toHaveAttribute("aria-expanded", "false");
    expect(questionsButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(cardsButton);
    expect(screen.getByTestId("active-editor")).toHaveTextContent("cards");
    expect(cardsButton).toHaveAttribute("aria-expanded", "true");
    expect(questionsButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(questionsButton);
    expect(screen.getByTestId("active-editor")).toHaveTextContent("questions");
    expect(cardsButton).toHaveAttribute("aria-expanded", "false");
    expect(questionsButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(questionsButton);
    expect(screen.getByTestId("active-editor")).toHaveTextContent("none");
    expect(questionsButton).toHaveAttribute("aria-expanded", "false");
  });

  it("updates displayed counts after a creation is registered", () => {
    renderHarness();

    expect(screen.getByTestId("generated-cards-count")).toHaveTextContent("2");
    expect(screen.getByTestId("generated-questions-count")).toHaveTextContent("3");

    fireEvent.click(screen.getByText("register-card"));
    fireEvent.click(screen.getByText("register-question"));

    expect(screen.getByTestId("generated-cards-count")).toHaveTextContent("3");
    expect(screen.getByTestId("generated-questions-count")).toHaveTextContent("4");
  });
});
