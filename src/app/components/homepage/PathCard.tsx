"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

/**
 * PathCard — compact persona selector for the homepage's "Choose Your
 * Path" grid. Renders as a link so click semantics + keyboard nav are
 * free. Analytics event fires on click if `eventName` is supplied.
 */
interface PathCardProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  eventName?: string;
}

export default function PathCard({
  href,
  icon: Icon,
  title,
  description,
  eventName,
}: PathCardProps) {
  return (
    <Link
      href={href}
      onClick={() => {
        if (eventName) trackEvent(eventName);
      }}
      className="group flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-green-primary hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-green-primary sm:p-5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-primary transition-colors group-hover:bg-green-primary group-hover:text-white">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-black-primary sm:text-base">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-500 sm:text-[13px]">
          {description}
        </p>
      </div>
    </Link>
  );
}
