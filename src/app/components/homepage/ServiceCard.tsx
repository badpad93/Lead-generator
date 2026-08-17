"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

/**
 * ServiceCard — used in the "Everything Vending Connector Offers" grid.
 * Larger footprint than PathCard, includes an explicit CTA row and an
 * optional highlight strip (used by the Placement Provider card to
 * surface "No platform commission").
 */
interface ServiceCardProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  ctaLabel: string;
  eventName?: string;
  highlights?: string[];
}

export default function ServiceCard({
  href,
  icon: Icon,
  title,
  description,
  ctaLabel,
  eventName,
  highlights,
}: ServiceCardProps) {
  return (
    <Link
      href={href}
      onClick={() => {
        if (eventName) trackEvent(eventName);
      }}
      className="group flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-green-primary hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-green-primary"
    >
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-green-primary transition-colors group-hover:bg-green-primary group-hover:text-white">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <h3 className="text-lg font-semibold text-black-primary">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{description}</p>

      {highlights && highlights.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {highlights.map((h) => (
            <li
              key={h}
              className="flex items-start gap-2 text-xs font-medium text-green-dark"
            >
              <span
                aria-hidden="true"
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-green-primary"
              />
              {h}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-5">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-primary transition-transform group-hover:translate-x-0.5">
          {ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
