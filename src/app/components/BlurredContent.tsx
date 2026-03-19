"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

/** Blurs text content for non-paid users */
export function BlurredText({
  children,
  isPurchased,
  placeholder,
}: {
  children: React.ReactNode;
  isPurchased: boolean;
  placeholder?: string;
  /** @deprecated use isPurchased */
  isSubscribed?: boolean;
}) {
  if (isPurchased) {
    return <>{children}</>;
  }

  return (
    <span className="select-none blur-sm" aria-hidden="true">
      {placeholder || children}
    </span>
  );
}

/** Blurs an entire section with a paywall overlay */
export function PaywallOverlay({
  children,
  isPurchased,
  message = "Purchase to view full details",
}: {
  children: React.ReactNode;
  isPurchased: boolean;
  message?: string;
  /** @deprecated use isPurchased */
  isSubscribed?: boolean;
}) {
  if (isPurchased) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="select-none blur-sm pointer-events-none" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-lg">
        <Link
          href="/pricing"
          className="flex items-center gap-2 rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-green-hover"
        >
          <Lock className="h-4 w-4" />
          {message}
        </Link>
      </div>
    </div>
  );
}

/** Blurs an image for non-paid users */
export function BlurredImage({
  src,
  alt,
  className,
  isPurchased,
}: {
  src: string;
  alt: string;
  className?: string;
  isPurchased: boolean;
  /** @deprecated use isPurchased */
  isSubscribed?: boolean;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={`${className || ""} ${!isPurchased ? "blur-md" : ""}`}
    />
  );
}
