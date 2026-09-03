"use client";

/**
 * Reveal — shared one-shot scroll-reveal wrapper.
 *
 * Children start hidden (translated / scaled + faded per
 * `direction`) and settle in the first time the element enters the
 * viewport. One-shot on purpose: re-hiding on scroll-up reads as
 * flicker. IntersectionObserver + CSS transitions only — no
 * animation library. prefers-reduced-motion reveals immediately.
 *
 * `delay` (ms) staggers siblings; `direction`:
 *   up    — slide up   (default)
 *   left  — slide in from the left
 *   right — slide in from the right
 *   scale — grow from 92%
 */

import { useEffect, useRef, useState } from "react";

type Direction = "up" | "left" | "right" | "scale";

const HIDDEN: Record<Direction, string> = {
  up: "translate-y-8 opacity-0",
  left: "-translate-x-8 opacity-0",
  right: "translate-x-8 opacity-0",
  scale: "scale-[0.92] opacity-0",
};

const SHOWN: Record<Direction, string> = {
  up: "translate-y-0 opacity-100",
  left: "translate-x-0 opacity-100",
  right: "translate-x-0 opacity-100",
  scale: "scale-100 opacity-100",
};

export default function Reveal({
  children,
  delay = 0,
  direction = "up",
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  direction?: Direction;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            obs.disconnect();
          }
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out will-change-transform ${
        shown ? SHOWN[direction] : HIDDEN[direction]
      } ${className}`}
    >
      {children}
    </div>
  );
}
