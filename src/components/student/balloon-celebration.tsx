"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties } from "react";

const FIRST_DELAY_MIN_MS = 15_000;
const FIRST_DELAY_MAX_MS = 30_000;
const VISIBLE_MS = 6_000;
const NEXT_DELAY_MIN_MS = 20_000;
const NEXT_DELAY_MAX_MS = 45_000;
const COLORS = ["#fbbf24", "#fb7185", "#34d399", "#38bdf8", "#a78bfa"];

type Balloon = {
  id: number;
  left: number;
  drift: number;
  scale: number;
  duration: number;
  color: string;
};

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function BalloonCelebration() {
  const reduceMotion = useReducedMotion();
  const [balloon, setBalloon] = useState<Balloon | null>(null);
  const timers = useRef<number[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    if (reduceMotion) return;
    let cancelled = false;

    function schedule(delay: number, action: () => void) {
      const timer = window.setTimeout(() => {
        if (!cancelled) action();
      }, delay);
      timers.current.push(timer);
    }

    function show() {
      const id = nextId.current;
      nextId.current += 1;
      setBalloon({
        id,
        left: randomBetween(6, 84),
        drift: randomBetween(-140, 140),
        scale: randomBetween(0.8, 1.3),
        duration: randomBetween(5_000, 7_000),
        color: COLORS[id % COLORS.length],
      });
      schedule(VISIBLE_MS, () => {
        setBalloon(null);
        schedule(randomBetween(NEXT_DELAY_MIN_MS, NEXT_DELAY_MAX_MS), show);
      });
    }

    schedule(randomBetween(FIRST_DELAY_MIN_MS, FIRST_DELAY_MAX_MS), show);

    return () => {
      cancelled = true;
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    };
  }, [reduceMotion]);

  if (reduceMotion || !balloon) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="balloon-layer"
      className="pointer-events-none fixed inset-0 z-20 overflow-hidden"
    >
      <span
        key={balloon.id}
        data-testid="celebration-balloon"
        className="balloon-float absolute bottom-0 block"
        style={
          {
            left: `${balloon.left}%`,
            "--balloon-drift": `${balloon.drift}px`,
            "--balloon-scale": balloon.scale,
            "--balloon-duration": `${balloon.duration}ms`,
          } as CSSProperties
        }
      >
        <svg width="64" height="98" viewBox="0 0 64 98" fill="none">
          <path
            d="M32 2c16.6 0 29 11.4 29 25.5C61 43 46.8 55 32 55S3 43 3 27.5C3 13.4 15.4 2 32 2Z"
            fill={balloon.color}
          />
          <path d="M29 55h6l-3 7-3-7Z" fill={balloon.color} />
          <path
            d="M32 62c0 10-8 16-8 25 0 4 3 6 6 8"
            stroke={balloon.color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <ellipse cx="21" cy="17" rx="5" ry="8" fill="#fff" opacity="0.35" transform="rotate(-20 21 17)" />
        </svg>
      </span>
    </div>
  );
}
