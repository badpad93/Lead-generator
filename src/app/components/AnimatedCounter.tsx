"use client";

import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";

interface AnimatedCounterProps {
  target: number;
  suffix?: string;
  duration?: number;
  className?: string;
}

export default function AnimatedCounter({
  target,
  suffix = "",
  duration = 2000,
  className = "",
}: AnimatedCounterProps) {
  const { count, ref } = useAnimatedCounter(target, duration);

  return (
    <span ref={ref as React.RefObject<HTMLSpanElement>} className={className}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}
