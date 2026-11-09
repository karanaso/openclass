// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtworkControls } from "@/components/admin/artwork-controls";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 202 });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ready = {
  status: "READY",
  updatedAt: "2026-11-08T18:00:00.000Z",
  lastError: null,
};

describe("ArtworkControls", () => {
  it("shows cache-busted scene and character previews for ready artwork", () => {
    render(<ArtworkControls lessonId="lesson-1" visual={ready} />);

    expect(screen.getByTestId("artwork-scene")).toHaveAttribute(
      "src",
      "/api/admin/lessons/lesson-1/visual/scene?v=2026-11-08T18%3A00%3A00.000Z",
    );
    expect(screen.getByTestId("artwork-character")).toHaveAttribute(
      "src",
      "/api/admin/lessons/lesson-1/visual/character?v=2026-11-08T18%3A00%3A00.000Z",
    );
    expect(screen.getByTestId("regenerate-artwork")).toHaveTextContent("regenerateArtwork");
  });

  it("requests a visual-only regeneration and refreshes", async () => {
    render(<ArtworkControls lessonId="lesson-1" visual={ready} />);

    fireEvent.click(screen.getByTestId("regenerate-artwork"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/lessons/lesson-1/visual", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
  });

  it("offers generation when no artwork exists", () => {
    render(<ArtworkControls lessonId="lesson-1" visual={null} />);
    expect(screen.getByTestId("regenerate-artwork")).toHaveTextContent("generateArtwork");
    expect(screen.queryByTestId("artwork-scene")).not.toBeInTheDocument();
  });

  it("disables the action while artwork is processing", () => {
    render(<ArtworkControls lessonId="lesson-1" visual={ready} busy />);
    expect(screen.getByTestId("regenerate-artwork")).toBeDisabled();
    expect(screen.getByTestId("regenerate-artwork")).toHaveTextContent("artworkRegenerating");
  });

  it("shows the last regeneration error", () => {
    render(
      <ArtworkControls
        lessonId="lesson-1"
        visual={{ ...ready, lastError: "image provider unavailable" }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("artworkLastError");
  });
});
