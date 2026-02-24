"use client";

import { useState } from "react";
import { Star } from "lucide-react";

interface StarRatingProps {
  value: number;
  max?: number;
  onChange?: (value: number) => void;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
} as const;

const textSizeMap = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
} as const;

export default function StarRating({
  value,
  max = 5,
  onChange,
  size = "md",
}: StarRatingProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const interactive = typeof onChange === "function";
  const iconSize = sizeMap[size];
  const textSize = textSizeMap[size];

  const displayValue = hoverIndex !== null ? hoverIndex : value;

  return (
    <div className="inline-flex items-center gap-1">
      <div
        className={`inline-flex items-center ${interactive ? "gap-0.5" : "gap-px"}`}
        onMouseLeave={() => interactive && setHoverIndex(null)}
      >
        {Array.from({ length: max }, (_, i) => {
          const starIndex = i + 1;
          const filled = starIndex <= displayValue;

          return (
            <button
              key={i}
              type="button"
              disabled={!interactive}
              className={`${
                interactive
                  ? "cursor-pointer hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-primary/50 rounded-sm"
                  : "cursor-default"
              } disabled:opacity-100`}
              onClick={() => interactive && onChange(starIndex)}
              onMouseEnter={() => interactive && setHoverIndex(starIndex)}
              aria-label={`${starIndex} star${starIndex !== 1 ? "s" : ""}`}
            >
              <Star
                className={`${iconSize} transition-colors ${
                  filled
                    ? "fill-orange-primary text-orange-primary"
                    : "fill-none text-gray-300"
                }`}
              />
            </button>
          );
        })}
      </div>

      {!interactive && (
        <span className={`${textSize} font-medium text-navy ml-1`}>
          {value.toFixed(1)}
        </span>
      )}
    </div>
  );
}
