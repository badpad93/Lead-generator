"use client";

import Image from "next/image";
import { useState } from "react";

/** Approved Vending Connector badge artwork (800x800 PNG, committed asset). */
export const VINNIE_BADGE_SRC = "/assistant/vinnie-vc-badge.png";

const SIZES = { sm: 28, md: 40 } as const;

interface Props {
  /** `md` ≈ 40px header badge, `sm` ≈ 28px message badge. */
  size?: keyof typeof SIZES;
  /** Show the small green availability dot (header only, when ready). */
  online?: boolean;
  /**
   * Alt text. Defaults to "" (decorative) because the badge always sits next
   * to visible "Vinnie" text; pass real alt text when it stands alone.
   */
  alt?: string;
  /**
   * Next 16 `preload`: emits a <link rel="preload"> in the document head,
   * disables lazy loading, and (with fetchPriority="high") fetches the
   * badge before hydration. Defaults to true for the header badge, which
   * is above the fold in the server-rendered HTML, and false for message
   * badges, which mount after streaming starts.
   */
  preload?: boolean;
}

/**
 * Restrained local fallback if the badge image cannot load: black disc,
 * thin green ring, white "VC". Inline SVG — no network, no base64 image.
 */
export function BadgeFallback() {
  return (
    <span className="flex h-full w-full items-center justify-center rounded-full bg-neutral-900" data-testid="vinnie-badge-fallback">
      <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden focusable="false">
        <circle cx="20" cy="20" r="18" fill="none" stroke="#01B744" strokeWidth="2" />
        <text x="20" y="25" textAnchor="middle" fontSize="13" fontWeight="700" fill="#FFFFFF" fontFamily="ui-sans-serif, system-ui, sans-serif">
          VC
        </text>
      </svg>
    </span>
  );
}

/**
 * Circular VC badge. The artwork has a thin white margin outside its green
 * ring, so the image is scaled up ~4% inside a round overflow-hidden wrapper
 * (no white square corners), and a 2px black separation ring keeps it crisp
 * against dark surfaces. The wrapper is dark (never white) so a not-yet-
 * loaded or failed image can never appear as a blank white disc; a failed
 * load swaps in BadgeFallback. No shadows, glows, gradients, or animation.
 */
/** The badge image itself; swaps to BadgeFallback if the request fails. */
function BadgeImage({ px, alt, preload }: { px: number; alt: string; preload: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <BadgeFallback />;
  return (
    <Image
      src={VINNIE_BADGE_SRC}
      alt={alt}
      width={px}
      height={px}
      quality={90}
      preload={preload}
      fetchPriority={preload ? "high" : undefined}
      draggable={false}
      onError={() => setFailed(true)}
      className="h-full w-full scale-[1.04] rounded-full object-cover"
    />
  );
}

export function VinnieAvatar({ size = "md", online = false, alt = "", preload = size === "md" }: Props) {
  const px = SIZES[size];
  const decorative = alt === "";
  return (
    <span className="relative inline-flex shrink-0" data-testid="vinnie-avatar" data-size={size} style={{ width: px, height: px }}>
      <span className="block h-full w-full overflow-hidden rounded-full bg-neutral-900 ring-2 ring-black" aria-hidden={decorative || undefined}>
        <BadgeImage px={px} alt={alt} preload={preload} />
      </span>
      {online ? (
        <span
          role="status"
          aria-label="Vinnie is available"
          data-testid="vinnie-online"
          className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-black bg-vinnie-green"
        />
      ) : null}
    </span>
  );
}
