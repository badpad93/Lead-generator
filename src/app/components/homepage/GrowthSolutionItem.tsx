"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Compact icon + label used in the horizontal "Growth Solutions" band.
 * Renders as a Link when href is provided, otherwise a static tile.
 */
interface GrowthSolutionItemProps {
  href?: string;
  icon: LucideIcon;
  label: string;
}

export default function GrowthSolutionItem({
  href,
  icon: Icon,
  label,
}: GrowthSolutionItemProps) {
  const inner = (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-green-primary transition-colors group-hover:bg-green-primary group-hover:text-white">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="text-xs font-medium text-black-primary sm:text-sm">{label}</span>
    </>
  );

  const shellClass =
    "group flex min-w-[8rem] flex-shrink-0 flex-col items-center gap-2 rounded-xl border border-transparent bg-white px-4 py-5 text-center transition-colors";

  if (href) {
    return (
      <Link
        href={href}
        className={`${shellClass} hover:border-green-200 hover:bg-green-50`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={shellClass}>{inner}</div>;
}
