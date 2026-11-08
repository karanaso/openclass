"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

const COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#ef4444"];

const PARTICLES = Array.from({ length: 24 }, (_, index) => {
  const angle = (index / 24) * Math.PI * 2;
  const distance = 70 + (index % 5) * 20;
  return {
    x: Math.round(Math.cos(angle) * distance),
    y: Math.round(Math.sin(angle) * distance - 40),
    rotate: (index * 47) % 360,
    delay: (index % 6) * 0.03,
    color: COLORS[index % COLORS.length],
  };
});

export function QuizCelebration({ active, label }: { active: boolean; label: string }) {
  const reduceMotion = useReducedMotion();
  const [showParticles, setShowParticles] = useState(active);

  useEffect(() => {
    if (!active) {
      setShowParticles(false);
      return;
    }
    if (reduceMotion) {
      setShowParticles(false);
      return;
    }
    setShowParticles(true);
    const timer = setTimeout(() => setShowParticles(false), 2400);
    return () => clearTimeout(timer);
  }, [active, reduceMotion]);

  if (!active) return null;

  return (
    <div
      data-testid="quiz-celebration"
      role="status"
      aria-live="polite"
      className="pointer-events-none relative flex items-center justify-center overflow-visible rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800"
    >
      {showParticles ? (
        <div aria-hidden data-testid="quiz-celebration-particles" className="absolute inset-0 flex items-center justify-center">
          {PARTICLES.map((particle, index) => (
            <motion.span
              key={index}
              className="absolute h-2 w-2 rounded-full"
              style={{ backgroundColor: particle.color }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
              animate={{ x: particle.x, y: particle.y, opacity: 0, rotate: particle.rotate }}
              transition={{ duration: 1.1, delay: particle.delay, ease: "easeOut" }}
            />
          ))}
        </div>
      ) : null}
      <Sparkles className="mr-2 h-5 w-5" aria-hidden />
      <span className="font-semibold">{label}</span>
    </div>
  );
}
