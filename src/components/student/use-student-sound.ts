"use client";

import { Howl } from "howler";
import { useCallback, useEffect, useRef, useState } from "react";

export const MUTE_STORAGE_KEY = "lessonlab:muted";
export const AMBIENCE_SOURCE = "/audio/student-ambience.mp3";
export const AMBIENCE_VOLUME = 0.16;

export type AmbienceStatus = "idle" | "playing" | "paused" | "blocked";

type StudentSound = {
  muted: boolean;
  status: AmbienceStatus;
  toggleMute: () => void;
  startAmbience: () => void;
  stopAmbience: () => void;
  pauseAmbience: () => void;
  resumeAmbience: () => void;
  playTone: (frequency: number, duration?: number, type?: OscillatorType) => void;
};

export function useStudentSound(): StudentSound {
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<AmbienceStatus>("idle");
  const mutedRef = useRef(false);
  const activeRef = useRef(false);
  const howlRef = useRef<Howl | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
    mutedRef.current = stored;
    setMuted(stored);
  }, []);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== MUTE_STORAGE_KEY) return;
      const next = event.newValue === "1";
      mutedRef.current = next;
      setMuted(next);
      if (next) {
        if (howlRef.current?.playing()) {
          howlRef.current.pause();
          setStatus("paused");
        }
      } else if (activeRef.current && !document.hidden) {
        const howl = howlRef.current;
        if (howl) {
          const id = howl.play();
          howl.volume(0, id);
          howl.fade(0, AMBIENCE_VOLUME, 800, id);
          setStatus("playing");
        }
      }
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const ensureHowl = useCallback(() => {
    if (howlRef.current) return howlRef.current;
    const howl = new Howl({
      src: [AMBIENCE_SOURCE],
      loop: true,
      volume: 0,
      html5: false,
      preload: true,
      onloaderror: () => setStatus("blocked"),
      onplayerror: () => setStatus("blocked"),
    });
    howlRef.current = howl;
    return howl;
  }, []);

  const startAmbience = useCallback(() => {
    activeRef.current = true;
    if (mutedRef.current) {
      setStatus("paused");
      return;
    }
    if (typeof document !== "undefined" && document.hidden) {
      setStatus("paused");
      return;
    }
    try {
      const howl = ensureHowl();
      if (howl.playing()) {
        setStatus("playing");
        return;
      }
      const id = howl.play();
      howl.volume(0, id);
      howl.fade(0, AMBIENCE_VOLUME, 800, id);
      setStatus("playing");
    } catch {
      setStatus("blocked");
    }
  }, [ensureHowl]);

  const pauseAmbience = useCallback(() => {
    if (!howlRef.current) return;
    howlRef.current.pause();
    setStatus("paused");
  }, []);

  const resumeAmbience = useCallback(() => {
    if (!activeRef.current || mutedRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const howl = ensureHowl();
      if (!howl.playing()) {
        const id = howl.play();
        howl.volume(0, id);
        howl.fade(0, AMBIENCE_VOLUME, 800, id);
      }
      setStatus("playing");
    } catch {
      setStatus("blocked");
    }
  }, [ensureHowl]);

  const stopAmbience = useCallback(() => {
    activeRef.current = false;
    howlRef.current?.stop();
    setStatus("idle");
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    window.localStorage.setItem(MUTE_STORAGE_KEY, next ? "1" : "0");
    if (next) {
      if (howlRef.current?.playing()) {
        howlRef.current.pause();
      }
      setStatus("paused");
    } else if (activeRef.current) {
      resumeAmbience();
    }
  }, [resumeAmbience]);

  const playTone = useCallback((frequency: number, duration = 0.15, type: OscillatorType = "sine") => {
    if (mutedRef.current || typeof window === "undefined") return;
    const Ctor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      audioContextRef.current ??= new Ctor();
      const context = audioContextRef.current;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.06, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch {
      // Audio is optional and never blocks the activity.
    }
  }, []);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        if (howlRef.current?.playing()) {
          howlRef.current.pause();
          setStatus("paused");
        }
        return;
      }
      resumeAmbience();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [resumeAmbience]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      howlRef.current?.unload();
      howlRef.current = null;
      void audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
    };
  }, []);

  return { muted, status, toggleMute, startAmbience, stopAmbience, pauseAmbience, resumeAmbience, playTone };
}
