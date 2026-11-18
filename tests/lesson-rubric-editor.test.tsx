// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonRubricEditor } from "@/components/admin/lesson-rubric-editor";
import type { LessonRubric } from "@/lib/rubric";

const refresh = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

function text(prefix: string) {
  return { el: `${prefix} EL`, en: `${prefix} EN` };
}

function validRubric(): LessonRubric {
  return {
    criteria: [1, 2, 3].map((index) => ({
      id: `criterion-${index}`,
      title: text(`Criterion ${index}`),
      description: text(`Description ${index}`),
    })),
    levels: [1, 2, 3].map((index) => ({
      id: `level-${index}`,
      label: text(`Level ${index}`),
      description: text(`Level description ${index}`),
    })),
  };
}

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function renderEditor(rubric: LessonRubric | null = validRubric()) {
  render(<LessonRubricEditor lessonId="lesson-1" initialRubric={rubric} />);
}

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("lesson rubric editor", () => {
  it("adds and removes criteria", () => {
    renderEditor();

    fireEvent.click(screen.getByTestId("rubric-add-criterion"));
    expect(screen.getByTestId("rubric-criterion-3")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rubric-remove-criterion-3"));
    expect(screen.queryByTestId("rubric-criterion-3")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("rubric-add-level"));
    expect(screen.getByTestId("rubric-level-3")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rubric-remove-level-3"));
    expect(screen.queryByTestId("rubric-level-3")).not.toBeInTheDocument();
  });

  it("saves the full rubric", async () => {
    const saved = validRubric();
    vi.mocked(fetch).mockResolvedValueOnce(response({ rubric: saved }));

    renderEditor();
    fireEvent.click(screen.getByTestId("rubric-save"));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/admin/lessons/lesson-1/rubric");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      criteria: expect.any(Array),
      levels: expect.any(Array),
    });
    expect(await screen.findByText("rubricSaved")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a validation error for too few criteria", () => {
    renderEditor({ ...validRubric(), criteria: validRubric().criteria.slice(0, 2) });
    fireEvent.click(screen.getByTestId("rubric-save"));
    expect(screen.getByText("rubricMinItems")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a save failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({}, 500));
    renderEditor();
    fireEvent.click(screen.getByTestId("rubric-save"));
    expect(await screen.findByText("rubricSaveFailed")).toBeInTheDocument();
  });

  it("clears the rubric and starts from an empty state", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ rubric: null }));

    renderEditor();
    fireEvent.click(screen.getByTestId("rubric-clear"));
    expect(screen.getByText("rubricEmpty")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rubric-save"));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({ criteria: [], levels: [] });
  });
});
