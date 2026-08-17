"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

/**
 * AudienceCard — used in "Built for Every Side of the Vending Industry".
 * Wider than PathCard, hairline card style with a subtle green top
 * accent so the section reads as a segmentation grid rather than
 * another CTA wall.
 */
interface AudienceCardProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  ctaLabel: string;
  eventName?: string;
}

export default function AudienceCard({
  href,
  icon: Icon,
  title,
  description,
  ctaLabel,
  eventName,
}: AudienceCardProps) {
  return (
    <Link
      href={href}
      onClick={() => {
        if (eventName) trackEvent(eventName);
      }}
      className="group flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-green-primary hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-green-primary"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-primary">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <h3 className="text-lg font-semibold text-black-primary">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">{description}</p>
      <div className="mt-auto pt-5">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-primary transition-transform group-hover:translate-x-0.5">
          {ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
