// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessCodeEntry } from "@/components/student/access-code-entry";
import en from "../messages/en.json";

const push = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderEntry() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AccessCodeEntry />
    </NextIntlClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AccessCodeEntry", () => {
  it("keeps only nine digits in the input", () => {
    renderEntry();
    const input = screen.getByTestId("access-code-input");

    fireEvent.change(input, { target: { value: "12ab34567890" } });
    expect(input).toHaveValue("123456789");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("maxlength", "9");
  });

  it("rejects a short number without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderEntry();

    fireEvent.change(screen.getByTestId("access-code-input"), { target: { value: "12345678" } });
    fireEvent.click(screen.getByTestId("access-code-submit"));

    expect(await screen.findByText("Enter a 9-digit lesson number.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a valid number and navigates to its student URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ lessonId: "lesson-1" }));
    vi.stubGlobal("fetch", fetchMock);
    renderEntry();

    fireEvent.change(screen.getByTestId("access-code-input"), { target: { value: "123456789" } });
    fireEvent.click(screen.getByTestId("access-code-submit"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/s/123456789"));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/s/code");
    expect(JSON.parse(String(init.body))).toEqual({ code: "123456789" });
  });

  it("shows a not-found message and stays on the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: { code: "code_not_found" } }, 404)),
    );
    renderEntry();

    fireEvent.change(screen.getByTestId("access-code-input"), { target: { value: "123456789" } });
    fireEvent.click(screen.getByTestId("access-code-submit"));

    expect(await screen.findByText("No lesson was found for that number.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("disables the form during a lockout and re-enables it after the countdown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: "code_rate_limited", details: { retryAfter: 1 } } }, 429),
      ),
    );
    renderEntry();

    fireEvent.change(screen.getByTestId("access-code-input"), { target: { value: "123456789" } });
    fireEvent.click(screen.getByTestId("access-code-submit"));

    expect(await screen.findByText("Too many attempts. Try again in 1 seconds.")).toBeInTheDocument();
    const submit = screen.getByTestId("access-code-submit");
    expect(submit).toBeDisabled();
    expect(screen.getByTestId("access-code-input")).toBeDisabled();

    await waitFor(() => expect(submit).not.toBeDisabled(), { timeout: 3000 });
  });
});
