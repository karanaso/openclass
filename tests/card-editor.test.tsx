// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardEditor, type EditableCard } from "@/components/admin/card-editor";
import en from "../messages/en.json";

const existingCard: EditableCard = {
  id: "card-1",
  position: 1,
  sourcePage: 1,
  translations: {
    el: { prompt: "Αρχική ερώτηση", answer: "Αρχική απάντηση" },
    en: { prompt: "Initial prompt", answer: "Initial answer" },
  },
};

const createdCard: EditableCard = {
  id: "card-2",
  position: 2,
  sourcePage: 2,
  translations: {
    el: { prompt: "Νέα ερώτηση", answer: "Νέα απάντηση" },
    en: { prompt: "New prompt", answer: "New answer" },
  },
};

function renderEditor(onCreated = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CardEditor lessonId="lesson-1" cards={[existingCard]} editable onCreated={onCreated} />
    </NextIntlClientProvider>,
  );
}

function fillNewCard() {
  fireEvent.change(screen.getByTestId("new-card-source-page"), { target: { value: "2" } });
  fireEvent.change(screen.getByTestId("new-card-el-prompt"), { target: { value: "Νέα ερώτηση" } });
  fireEvent.change(screen.getByTestId("new-card-el-answer"), { target: { value: "Νέα απάντηση" } });
  fireEvent.change(screen.getByTestId("new-card-en-prompt"), { target: { value: "New prompt" } });
  fireEvent.change(screen.getByTestId("new-card-en-answer"), { target: { value: "New answer" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CardEditor creation", () => {
  it("creates a card, appends it to the deck, and reports the count callback", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ card: createdCard }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    renderEditor(onCreated);

    fillNewCard();
    fireEvent.click(screen.getByTestId("new-card-save"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdCard));
    expect(await screen.findByTestId("card-editor-item-1")).toBeInTheDocument();
    expect(screen.getByTestId("card-editor-item-1")).toHaveTextContent("Card 2");
    expect(screen.getByText("Card added.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/lessons/lesson-1/cards",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          sourcePage: 2,
          translations: createdCard.translations,
        }),
      }),
    );
  });

  it("rejects blank bilingual content before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderEditor();

    fireEvent.click(screen.getByTestId("new-card-save"));

    expect(screen.getByRole("alert")).toHaveTextContent("Prompt and answer are required in both languages.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
