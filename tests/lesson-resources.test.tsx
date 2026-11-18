// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LessonResources } from "@/components/student/lesson-resources";
import type { StudentResource } from "@/server/student/lesson-data";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key.split(".").pop() ?? key,
}));

afterEach(() => {
  cleanup();
});

const link: StudentResource = {
  id: "link-1",
  kind: "LINK",
  title: "Study guide",
  description: "Extra reading",
  url: "https://www.example.com/guide",
  youtubeId: null,
  sourcePage: 1,
};

const video: StudentResource = {
  id: "video-1",
  kind: "YOUTUBE",
  title: "Lesson video",
  description: null,
  url: "https://youtu.be/dQw4w9WgXcQ",
  youtubeId: "dQw4w9WgXcQ",
  sourcePage: 2,
};

const unsafe: StudentResource = {
  id: "unsafe-1",
  kind: "LINK",
  title: "Legacy resource",
  description: null,
  url: "javascript:alert(1)",
  youtubeId: null,
  sourcePage: null,
};

describe("student lesson resources", () => {
  it("lists titles, descriptions, and safe external links", () => {
    render(<LessonResources resources={[link]} />);

    expect(screen.getByText("Study guide")).toBeInTheDocument();
    expect(screen.getByText("Extra reading")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();

    const anchor = screen.getByTestId("resource-link-0");
    expect(anchor).toHaveAttribute("href", "https://www.example.com/guide");
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
    expect(anchor).toHaveAttribute("aria-label", "openLinkFor");
  });

  it("swaps a YouTube play button for the privacy-enhanced embed", () => {
    render(<LessonResources resources={[video]} />);

    expect(screen.queryByTestId("resource-iframe")).not.toBeInTheDocument();
    expect(screen.getByTestId("resource-youtube-link-0")).toHaveAttribute(
      "href",
      "https://youtu.be/dQw4w9WgXcQ",
    );

    fireEvent.click(screen.getByTestId("resource-play-0"));

    const iframe = screen.getByTestId("resource-iframe");
    expect(iframe).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
    );
    expect(iframe).toHaveAttribute("title", "resourceVideoPlayer");
    expect(iframe).toHaveAttribute("loading", "lazy");
    expect(iframe).toHaveAttribute("allowfullscreen");
  });

  it("does not render an unsafe stored URL as an activatable link", () => {
    render(<LessonResources resources={[unsafe]} />);

    expect(screen.getByTestId("resource-unavailable-0")).toBeInTheDocument();
    expect(screen.queryByTestId("resource-link-0")).not.toBeInTheDocument();
  });
});
