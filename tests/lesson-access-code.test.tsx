// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LessonAccessCode } from "@/components/admin/lesson-access-code";
import en from "../messages/en.json";

const refresh = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function renderCode(code = "123456789") {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LessonAccessCode lessonId="lesson-1" initialCode={code} />
    </NextIntlClientProvider>,
  );
}

describe("LessonAccessCode", () => {
  it("shows the number with a round, labelled refresh control", () => {
    renderCode();
    expect(screen.getByTestId("lesson-access-code-value")).toHaveTextContent("123456789");
    const button = screen.getByTestId("refresh-lesson-access-code");
    expect(button).toHaveAttribute("aria-label", "Create a new lesson number");
    expect(button.className).toContain("rounded-full");
  });

  it("regenerates the number after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessCode: "987654321" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderCode();

    fireEvent.click(screen.getByTestId("refresh-lesson-access-code"));

    await waitFor(() => expect(screen.getByTestId("lesson-access-code-value")).toHaveTextContent("987654321"));
    expect(screen.getByText("New lesson number created.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/lessons/lesson-1/access-code", { method: "POST" });
    expect(refresh).toHaveBeenCalled();
  });

  it("does nothing when the confirmation is dismissed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderCode();

    fireEvent.click(screen.getByTestId("refresh-lesson-access-code"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("lesson-access-code-value")).toHaveTextContent("123456789");
  });

  it("keeps the current number and reports a failed regeneration", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "internal_error" } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    renderCode();

    fireEvent.click(screen.getByTestId("refresh-lesson-access-code"));

    expect(
      await screen.findByText("Could not change the lesson number. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("lesson-access-code-value")).toHaveTextContent("123456789");
  });
});
