// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MUTE_STORAGE_KEY, useStudentSound } from "@/components/student/use-student-sound";

const howlerMock = vi.hoisted(() => {
  type Options = {
    src: string[];
    loop: boolean;
    volume: number;
    onloaderror?: (id: number, error: unknown) => void;
    onplayerror?: (id: number, error: unknown) => void;
  };

  class MockHowl {
    static instances: MockHowl[] = [];
    options: Options;
    playingValue = false;
    play = vi.fn(() => {
      this.playingValue = true;
      return 1;
    });
    pause = vi.fn(() => {
      this.playingValue = false;
    });
    stop = vi.fn(() => {
      this.playingValue = false;
    });
    playing = vi.fn(() => this.playingValue);
    volume = vi.fn();
    fade = vi.fn();
    unload = vi.fn();

    constructor(options: Options) {
      this.options = options;
      MockHowl.instances.push(this);
    }
  }

  return { MockHowl };
});

vi.mock("howler", () => ({ Howl: howlerMock.MockHowl }));

type AudioContextMock = {
  currentTime: number;
  destination: Record<string, never>;
  createOscillator: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

function createAudioContextMock(): AudioContextMock {
  return {
    currentTime: 0,
    destination: {},
    createOscillator: vi.fn(() => ({
      type: "sine",
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    })),
    close: vi.fn(() => Promise.resolve()),
  };
}

const audioContextSpy = vi.fn();

beforeEach(() => {
  howlerMock.MockHowl.instances.length = 0;
  audioContextSpy.mockReset();
  window.localStorage.clear();
  vi.stubGlobal("AudioContext", audioContextSpy);
  vi.stubGlobal("webkitAudioContext", undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useStudentSound", () => {
  it("defaults to unmuted when no preference is stored", () => {
    const { result } = renderHook(() => useStudentSound());

    expect(result.current.muted).toBe(false);
    expect(result.current.status).toBe("idle");
    expect(howlerMock.MockHowl.instances).toHaveLength(0);
  });

  it("persists mute and unmute to the shared storage key", () => {
    const { result } = renderHook(() => useStudentSound());

    act(() => result.current.toggleMute());
    expect(result.current.muted).toBe(true);
    expect(window.localStorage.getItem(MUTE_STORAGE_KEY)).toBe("1");

    act(() => result.current.toggleMute());
    expect(result.current.muted).toBe(false);
    expect(window.localStorage.getItem(MUTE_STORAGE_KEY)).toBe("0");
  });

  it("adopts a muted preference changed in another tab", () => {
    const { result } = renderHook(() => useStudentSound());

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: MUTE_STORAGE_KEY, newValue: "1" }));
    });
    expect(result.current.muted).toBe(true);

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: MUTE_STORAGE_KEY, newValue: "0" }));
    });
    expect(result.current.muted).toBe(false);
  });

  it("does not create or play ambience or tones while muted", () => {
    window.localStorage.setItem(MUTE_STORAGE_KEY, "1");
    const { result } = renderHook(() => useStudentSound());

    act(() => result.current.startAmbience());
    act(() => result.current.playTone(440));

    expect(howlerMock.MockHowl.instances).toHaveLength(0);
    expect(audioContextSpy).not.toHaveBeenCalled();
    expect(result.current.status).toBe("paused");
  });

  it("starts ambience on an interaction and resumes it when unmuted", () => {
    window.localStorage.setItem(MUTE_STORAGE_KEY, "1");
    const { result } = renderHook(() => useStudentSound());

    act(() => result.current.startAmbience());
    expect(result.current.status).toBe("paused");

    act(() => result.current.toggleMute());

    const howl = howlerMock.MockHowl.instances[0];
    expect(howl).toBeDefined();
    expect(howl.play).toHaveBeenCalledTimes(1);
    expect(howl.fade).toHaveBeenCalledWith(0, 0.16, 800, 1);
    expect(result.current.status).toBe("playing");
  });

  it("pauses while the tab is hidden and resumes when visible", () => {
    let hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });

    const { result } = renderHook(() => useStudentSound());
    act(() => result.current.startAmbience());
    const howl = howlerMock.MockHowl.instances[0];
    expect(howl.play).toHaveBeenCalledTimes(1);

    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(howl.pause).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("paused");

    hidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(howl.play).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("playing");

    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  it("stops ambience when the mode ends", () => {
    const { result } = renderHook(() => useStudentSound());
    act(() => result.current.startAmbience());
    const howl = howlerMock.MockHowl.instances[0];

    act(() => result.current.stopAmbience());

    expect(howl.stop).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");
  });

  it("reports blocked and keeps running when the audio file cannot load", () => {
    const { result } = renderHook(() => useStudentSound());
    act(() => result.current.startAmbience());
    const howl = howlerMock.MockHowl.instances[0];

    expect(() => {
      act(() => howl.options.onloaderror?.(1, new Error("missing")));
    }).not.toThrow();

    expect(result.current.status).toBe("blocked");
    expect(result.current.muted).toBe(false);
  });

  it("plays tones with WebAudio when sound is enabled", () => {
    audioContextSpy.mockImplementation(() => createAudioContextMock());
    const { result } = renderHook(() => useStudentSound());

    act(() => result.current.playTone(660, 0.3, "sawtooth"));

    expect(audioContextSpy).toHaveBeenCalledTimes(1);
  });

  it("unloads ambience when the component unmounts", () => {
    const { result, unmount } = renderHook(() => useStudentSound());
    act(() => result.current.startAmbience());
    const howl = howlerMock.MockHowl.instances[0];

    unmount();

    expect(howl.unload).toHaveBeenCalledTimes(1);
  });
});
