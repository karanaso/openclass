// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoVariantControls } from "@/components/admin/video-variant-controls";

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

function ready(locale = "el") {
  return {
    locale,
    status: "READY",
    error: null,
    progress: null,
    hasVideo: true,
    hasCaptions: true,
    hasPoster: true,
  };
}

function variant(
  locale: string,
  status: string,
  error: string | null = null,
  media: { hasVideo?: boolean; hasCaptions?: boolean; hasPoster?: boolean } = {},
) {
  return {
    locale,
    status,
    error,
    progress: null,
    hasVideo: media.hasVideo ?? false,
    hasCaptions: media.hasCaptions ?? false,
    hasPoster: media.hasPoster ?? false,
  };
}

describe("VideoVariantControls", () => {
  it("shows Play and Recreate for a ready variant and Generate for a missing one", () => {
    render(<VideoVariantControls lessonId="lesson-1" videos={[ready()]} />);

    expect(screen.getByTestId("video-play-el")).toHaveTextContent("playVariant");
    expect(screen.getByTestId("video-variant-el")).toHaveTextContent("recreateVariant");
    expect(screen.getByTestId("video-variant-en")).toHaveTextContent("generateVariant");
    expect(screen.queryByTestId("video-play-en")).not.toBeInTheDocument();
  });

  it("posts a recreate request for the selected locale and refreshes", async () => {
    render(<VideoVariantControls lessonId="lesson-1" videos={[ready()]} />);

    fireEvent.click(screen.getByTestId("video-variant-el"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/lessons/lesson-1/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: "el" }),
    });
  });

  it("posts a generate request when no variant exists", async () => {
    render(<VideoVariantControls lessonId="lesson-1" videos={[]} />);

    fireEvent.click(screen.getByTestId("video-variant-en"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/lessons/lesson-1/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: "en" }),
    });
  });

  it("opens one inline preview with video, poster, and captions", () => {
    render(
      <VideoVariantControls lessonId="lesson-1" videos={[ready("el"), ready("en")]} />,
    );

    fireEvent.click(screen.getByTestId("video-play-el"));

    const preview = screen.getByTestId("video-preview-el");
    expect(preview).toHaveAttribute(
      "poster",
      "/api/admin/lessons/lesson-1/media/el/poster",
    );
    expect(preview.querySelector("source")).toHaveAttribute(
      "src",
      "/api/admin/lessons/lesson-1/media/el/video",
    );
    expect(preview.querySelector("track")).toHaveAttribute(
      "src",
      "/api/admin/lessons/lesson-1/media/el/captions",
    );

    fireEvent.click(screen.getByTestId("video-play-en"));
    expect(screen.queryByTestId("video-preview-el")).not.toBeInTheDocument();
    expect(screen.getByTestId("video-preview-en")).toBeInTheDocument();
  });

  it("omits poster and captions when the provider did not supply them", () => {
    render(
      <VideoVariantControls
        lessonId="lesson-1"
        videos={[{ ...variant("el", "READY"), hasVideo: true, hasCaptions: false, hasPoster: false }]}
      />,
    );

    fireEvent.click(screen.getByTestId("video-play-el"));
    const preview = screen.getByTestId("video-preview-el");
    expect(preview).not.toHaveAttribute("poster");
    expect(preview.querySelector("track")).not.toBeInTheDocument();
  });

  it("reports an unavailable preview when the video fails to load", () => {
    render(<VideoVariantControls lessonId="lesson-1" videos={[ready()]} />);

    fireEvent.click(screen.getByTestId("video-play-el"));
    fireEvent.error(screen.getByTestId("video-preview-el"));

    expect(screen.getByRole("alert")).toHaveTextContent("videoPreviewUnavailable");
  });

  it("shows Recreate and the recorded error for failed and skipped variants", () => {
    render(
      <VideoVariantControls
        lessonId="lesson-1"
        videos={[variant("el", "FAILED", "render failed"), variant("en", "SKIPPED", "too long")]}
      />,
    );

    expect(screen.getByText("render failed")).toBeInTheDocument();
    expect(screen.getByText("too long")).toBeInTheDocument();
    expect(screen.getByTestId("video-variant-el")).toHaveTextContent("recreateVariant");
    expect(screen.getByTestId("video-variant-en")).toHaveTextContent("recreateVariant");
    expect(screen.queryByTestId("video-play-el")).not.toBeInTheDocument();
  });

  it("keeps previous media playable after a failed recreate", () => {
    render(
      <VideoVariantControls
        lessonId="lesson-1"
        videos={[variant("el", "FAILED", "provider failed", { hasVideo: true, hasPoster: true })]}
      />,
    );

    expect(screen.getByTestId("video-play-el")).toBeInTheDocument();
    expect(screen.getByTestId("video-variant-el")).toHaveTextContent("recreateVariant");

    fireEvent.click(screen.getByTestId("video-play-el"));
    const preview = screen.getByTestId("video-preview-el");
    expect(preview).toHaveAttribute("poster", "/api/admin/lessons/lesson-1/media/el/poster");
    expect(preview.querySelector("track")).not.toBeInTheDocument();
  });

  it("keeps media playable while a new provider render is processing", () => {
    render(
      <VideoVariantControls
        lessonId="lesson-1"
        videos={[{ ...variant("el", "RENDERING"), hasVideo: true, progress: 42 }]}
      />,
    );

    expect(screen.getByTestId("video-play-el")).toBeInTheDocument();
    expect(screen.getByText("videoProgress")).toBeInTheDocument();
    expect(screen.getByTestId("video-recreate-el")).toBeDisabled();
  });

  it("disables actions while a variant is processing", () => {
    render(
      <VideoVariantControls
        lessonId="lesson-1"
        videos={[variant("el", "PENDING"), variant("en", "RENDERING")]}
      />,
    );

    expect(screen.getByTestId("video-recreate-el")).toBeDisabled();
    expect(screen.getByTestId("video-recreate-en")).toBeDisabled();
    expect(screen.queryByTestId("video-play-el")).not.toBeInTheDocument();
    expect(screen.queryByTestId("video-play-en")).not.toBeInTheDocument();
  });
});
