// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionEditor } from "@/components/admin/question-editor";
import type { EditableQuestion } from "@/server/services/questions";
import en from "../messages/en.json";

function options(type: "TRUE_FALSE" | "MULTIPLE_CHOICE", prefix: string) {
  const ids = type === "TRUE_FALSE" ? ["a", "b"] : ["a", "b", "c", "d"];
  return ids.map((id) => ({ id, text: `${prefix} ${id}` }));
}

function question(
  id: string,
  mode: "QUESTIONNAIRE" | "GAME",
  position: number,
  type: "TRUE_FALSE" | "MULTIPLE_CHOICE",
  suffix: string,
): EditableQuestion {
  return {
    id,
    mode,
    position,
    type,
    correctOptionId: "b",
    sourcePage: 1,
    translations: {
      el: {
        prompt: `Ελληνική ${suffix}`,
        options: options(type, `Ελληνική ${suffix}`),
        explanation: `Εξήγηση ${suffix}`,
      },
      en: {
        prompt: `English ${suffix}`,
        options: options(type, `English ${suffix}`),
        explanation: `Explanation ${suffix}`,
      },
    },
  };
}

const questionnaireFirst = question("q1", "QUESTIONNAIRE", 1, "TRUE_FALSE", "question one");
const questionnaireSecond = question("q2", "QUESTIONNAIRE", 2, "MULTIPLE_CHOICE", "question two");
const gameFirst = question("g1", "GAME", 1, "TRUE_FALSE", "game one");

function renderEditor(onCreated = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <QuestionEditor
        lessonId="lesson-1"
        questions={[questionnaireFirst, questionnaireSecond, gameFirst]}
        editable
        onCreated={onCreated}
      />
    </NextIntlClientProvider>,
  );
}

function fillNewQuestion(modeKey: "questionnaire" | "game", suffix: string) {
  fireEvent.change(screen.getByTestId(`new-question-${modeKey}-el-prompt`), {
    target: { value: `Νέα ερώτηση ${suffix}` },
  });
  fireEvent.change(screen.getByTestId(`new-question-${modeKey}-el-option-a`), { target: { value: "Σωστό" } });
  fireEvent.change(screen.getByTestId(`new-question-${modeKey}-el-option-b`), { target: { value: "Λάθος" } });
  fireEvent.change(screen.getByTestId(`new-question-${modeKey}-el-explanation`), { target: { value: "Εξήγηση" } });
  fireEvent.change(screen.getByTestId(`new-question-${modeKey}-en-prompt`), {
    target: { value: `New question ${suffix}` },
  });
  fireEvent.change(screen.getByTestId(`new-question-${modeKey}-en-option-a`), { target: { value: "True" } });
  fireEvent.change(screen.getByTestId(`new-question-${modeKey}-en-option-b`), { target: { value: "False" } });
  fireEvent.change(screen.getByTestId(`new-question-${modeKey}-en-explanation`), {
    target: { value: "Explanation" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("QuestionEditor", () => {
  it("renders questionnaire and game sections with editable content", () => {
    renderEditor();

    expect(screen.getByTestId("question-section-questionnaire")).toHaveTextContent("Questionnaire");
    expect(screen.getByTestId("question-section-game")).toHaveTextContent("Game");
    expect(screen.getByTestId("question-editor-item-questionnaire-0")).toHaveTextContent("Question 1");
    expect(screen.getByTestId("question-editor-item-questionnaire-0")).toHaveTextContent("True/False");
    expect(screen.getByTestId("question-editor-item-questionnaire-1")).toHaveTextContent("Multiple choice");
    expect(screen.getByTestId("question-editor-item-game-0")).toHaveTextContent("Question 1");
    expect(screen.getByTestId("question-questionnaire-0-el-prompt")).toHaveValue("Ελληνική question one");
    expect(screen.getByTestId("question-questionnaire-1-en-option-d")).toHaveValue("English question two d");
  });

  it("saves an edited question with both locales and the correct option", async () => {
    const updated = {
      ...questionnaireFirst,
      sourcePage: 2,
      translations: {
        ...questionnaireFirst.translations,
        el: { ...questionnaireFirst.translations.el, prompt: "Ενημερωμένη ερώτηση" },
        en: { ...questionnaireFirst.translations.en, prompt: "Updated question" },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ question: updated }) });
    vi.stubGlobal("fetch", fetchMock);
    renderEditor();

    fireEvent.change(screen.getByTestId("question-questionnaire-0-el-prompt"), {
      target: { value: "Ενημερωμένη ερώτηση" },
    });
    fireEvent.change(screen.getByTestId("question-questionnaire-0-en-prompt"), {
      target: { value: "Updated question" },
    });
    fireEvent.change(screen.getByTestId("question-questionnaire-0-source-page"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("question-questionnaire-0-save"));

    await waitFor(() => expect(screen.getByText("Question saved.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/lessons/lesson-1/questions/q1",
      expect.objectContaining({ method: "PATCH" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.correctOptionId).toBe("b");
    expect(body.sourcePage).toBe(2);
    expect(body.translations.el.prompt).toBe("Ενημερωμένη ερώτηση");
    expect(body.translations.en.prompt).toBe("Updated question");
  });

  it("creates a questionnaire question and reports the count callback", async () => {
    const created = question("q3", "QUESTIONNAIRE", 3, "TRUE_FALSE", "created questionnaire");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ question: created }) });
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    renderEditor(onCreated);

    fillNewQuestion("questionnaire", "created");
    fireEvent.click(screen.getByTestId("new-question-questionnaire-save"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(await screen.findByTestId("question-editor-item-questionnaire-2")).toHaveTextContent("Question 3");
    expect(screen.getByText("Question added.")).toBeInTheDocument();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.mode).toBe("QUESTIONNAIRE");
    expect(body.type).toBe("TRUE_FALSE");
    expect(body.translations.el.options).toEqual([
      { id: "a", text: "Σωστό" },
      { id: "b", text: "Λάθος" },
    ]);
  });

  it("creates a game question at the end of its section", async () => {
    const created = question("g2", "GAME", 2, "TRUE_FALSE", "created game");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ question: created }) });
    vi.stubGlobal("fetch", fetchMock);
    renderEditor();

    fillNewQuestion("game", "game");
    fireEvent.click(screen.getByTestId("new-question-game-save"));

    await waitFor(() => expect(screen.getByTestId("question-editor-item-game-1")).toHaveTextContent("Question 2"));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.mode).toBe("GAME");
  });

  it("shows a validation error and skips the request for blank content", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderEditor();

    fireEvent.change(screen.getByTestId("question-questionnaire-0-el-prompt"), { target: { value: "   " } });
    fireEvent.click(screen.getByTestId("question-questionnaire-0-save"));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Prompt, options, and explanation are required in both languages.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
