// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfViewer } from "@/components/student/pdf-viewer";
import en from "../messages/en.json";

const url = "/api/s/token/lessons/lesson-1/source";
const fetchMock = vi.fn();

function response(status: number, ok = status < 400) {
  return { ok, status, body: { cancel: () => Promise.resolve() } };
}

function renderViewer() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PdfViewer token="token" url={url} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pdf viewer", () => {
  it("probes the document and renders the embedded viewer with open and full-screen actions", async () => {
    fetchMock.mockResolvedValue(response(206));
    renderViewer();

    const frame = await screen.findByTestId("pdf-frame");
    expect(frame).toHaveAttribute("src", url);
    expect(frame).toHaveAttribute("title", "Lesson material");
    expect(fetchMock).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ headers: { Range: "bytes=0-0" } }),
    );

    const open = screen.getByTestId("pdf-open");
    expect(open).toHaveAttribute("href", url);
    expect(open).toHaveAttribute("target", "_blank");
    expect(screen.getByTestId("pdf-fullscreen")).toHaveTextContent("Full screen");
    expect(screen.getByText(en.student.pdfDownloadHelp)).toBeInTheDocument();
  });

  it("asks the student to re-enter their name when the session expired", async () => {
    fetchMock.mockResolvedValue(response(401, false));
    renderViewer();

    expect(await screen.findByTestId("pdf-session-expired")).toHaveTextContent(
      en.student.pdfSessionExpired,
    );
    expect(screen.getByTestId("pdf-reenter-name")).toHaveAttribute("href", "/en/s/token");
    expect(screen.queryByTestId("pdf-frame")).not.toBeInTheDocument();
  });

  it("shows an unavailable state and retries without a page reload", async () => {
    fetchMock.mockResolvedValueOnce(response(500, false)).mockResolvedValueOnce(response(206));
    renderViewer();

    expect(await screen.findByTestId("pdf-error")).toHaveTextContent(en.student.pdfUnavailable);
    fireEvent.click(screen.getByTestId("pdf-retry"));

    expect(await screen.findByTestId("pdf-frame")).toHaveAttribute("src", url);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("opens the document in a new tab when full screen is unsupported", async () => {
    fetchMock.mockResolvedValue(response(206));
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderViewer();

    await screen.findByTestId("pdf-frame");
    fireEvent.click(screen.getByTestId("pdf-fullscreen"));

    await waitFor(() => expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer"));
  });
});
