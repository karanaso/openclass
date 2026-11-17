// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NameEntryForm } from "@/components/student/name-entry-form";
import en from "../messages/en.json";

const refresh = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <NameEntryForm token="share-token" />
    </NextIntlClientProvider>,
  );
}

describe("NameEntryForm", () => {
  it("renders the school field above the name field and posts both", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderForm();

    const school = screen.getByTestId("student-school");
    const name = screen.getByTestId("student-name");
    expect(school.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(school).toBeRequired();
    expect(school).toHaveAttribute("maxlength", "120");
    expect(name).toBeRequired();

    fireEvent.change(school, { target: { value: "1ο Γυμνάσιο" } });
    fireEvent.change(name, { target: { value: "Maria" } });
    fireEvent.click(screen.getByTestId("student-start"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/s/share-token/session");
    expect(JSON.parse(String(init.body))).toEqual({ name: "Maria", school: "1ο Γυμνάσιο" });
  });

  it("shows the school-specific error returned by the session route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "invalid_school" } }), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    renderForm();

    fireEvent.change(screen.getByTestId("student-school"), { target: { value: "School" } });
    fireEvent.change(screen.getByTestId("student-name"), { target: { value: "Maria" } });
    fireEvent.click(screen.getByTestId("student-start"));

    expect(await screen.findByText("Enter a school of up to 120 characters.")).toBeInTheDocument();
  });
});
