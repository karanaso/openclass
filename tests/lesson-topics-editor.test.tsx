// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonTopicsEditor } from "@/components/admin/lesson-topics-editor";

const refresh = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function renderEditor(topics = { el: ["Φωτοσύνθεση"], en: ["Photosynthesis"] }) {
  render(<LessonTopicsEditor lessonId="lesson-1" initialTopics={topics} />);
}

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("lesson topics editor", () => {
  it("adds and removes topics", () => {
    renderEditor();

    fireEvent.change(screen.getByTestId("topic-input-en"), { target: { value: "Chlorophyll" } });
    fireEvent.click(screen.getByTestId("topic-add-en"));
    expect(screen.getByText("Chlorophyll")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("topic-remove-el-0"));
    expect(screen.queryByText("Φωτοσύνθεση")).not.toBeInTheDocument();
  });

  it("clears a whole locale list", () => {
    renderEditor();
    fireEvent.click(screen.getByTestId("topic-clear-en"));
    expect(screen.getAllByText("topicsEmpty").length).toBeGreaterThan(0);
  });

  it("saves both locale lists", async () => {
    const saved = { el: ["Φωτοσύνθεση", "Χλωροφύλλη"], en: ["Photosynthesis"] };
    vi.mocked(fetch).mockResolvedValueOnce(response({ topics: saved }));

    renderEditor();
    fireEvent.change(screen.getByTestId("topic-input-el"), { target: { value: "Χλωροφύλλη" } });
    fireEvent.click(screen.getByTestId("topic-add-el"));
    fireEvent.click(screen.getByTestId("topic-save"));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/admin/lessons/lesson-1/topics");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      el: ["Φωτοσύνθεση", "Χλωροφύλλη"],
      en: ["Photosynthesis"],
    });
    expect(await screen.findByText("topicSaved")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a validation error for duplicates and oversized topics", () => {
    renderEditor();
    fireEvent.change(screen.getByTestId("topic-input-en"), { target: { value: "photosynthesis" } });
    fireEvent.click(screen.getByTestId("topic-add-en"));
    expect(screen.getByText("topicDuplicate")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("topic-input-en"), { target: { value: "x".repeat(41) } });
    fireEvent.click(screen.getByTestId("topic-add-en"));
    expect(screen.getByText("topicTooLong")).toBeInTheDocument();
  });

  it("shows a save failure without discarding the draft", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({}, 500));
    renderEditor({ el: [], en: [] });

    fireEvent.change(screen.getByTestId("topic-input-en"), { target: { value: "Draft topic" } });
    fireEvent.click(screen.getByTestId("topic-add-en"));
    fireEvent.click(screen.getByTestId("topic-save"));

    expect(await screen.findByText("topicSaveFailed")).toBeInTheDocument();
    expect(screen.getByText("Draft topic")).toBeInTheDocument();
  });
});
