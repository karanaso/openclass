// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BalloonCelebration } from "@/components/student/balloon-celebration";

const motionState = vi.hoisted(() => ({ reduced: false }));

vi.mock("framer-motion", () => ({
  useReducedMotion: () => motionState.reduced,
}));

const FIRST_DELAY_MS = 22_500;
const NEXT_DELAY_MS = 32_500;
const VISIBLE_MS = 6_000;

beforeEach(() => {
  vi.useFakeTimers();
  motionState.reduced = false;
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("BalloonCelebration", () => {
  it("shows one accessible-hidden balloon after the first randomized delay", () => {
    render(<BalloonCelebration />);

    expect(screen.queryByTestId("celebration-balloon")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(FIRST_DELAY_MS - 1));
    expect(screen.queryByTestId("celebration-balloon")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    const balloon = screen.getByTestId("celebration-balloon");
    const layer = screen.getByTestId("balloon-layer");

    expect(balloon).toBeInTheDocument();
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer.className).toContain("pointer-events-none");
    expect(layer.querySelectorAll("button, a, input, select, textarea, [tabindex]")).toHaveLength(0);
  });

  it("hides the balloon after its drift and schedules the next one", () => {
    render(<BalloonCelebration />);

    act(() => vi.advanceTimersByTime(FIRST_DELAY_MS));
    expect(screen.getByTestId("celebration-balloon")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(VISIBLE_MS - 1));
    expect(screen.getByTestId("celebration-balloon")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId("celebration-balloon")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(NEXT_DELAY_MS - 1));
    expect(screen.queryByTestId("celebration-balloon")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("celebration-balloon")).toBeInTheDocument();
  });

  it("clears pending timers on unmount", () => {
    const { unmount } = render(<BalloonCelebration />);
    act(() => vi.advanceTimersByTime(FIRST_DELAY_MS));
    expect(screen.getByTestId("celebration-balloon")).toBeInTheDocument();

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(() => {
      act(() => vi.advanceTimersByTime(120_000));
    }).not.toThrow();
  });

  it("renders nothing when reduced motion is requested", () => {
    motionState.reduced = true;

    render(<BalloonCelebration />);

    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.queryByTestId("celebration-balloon")).not.toBeInTheDocument();
    expect(screen.queryByTestId("balloon-layer")).not.toBeInTheDocument();
  });
});
