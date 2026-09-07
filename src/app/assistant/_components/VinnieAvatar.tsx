import Image from "next/image";

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
}

/**
 * Circular VC badge. The artwork has a thin white margin outside its green
 * ring, so the image is scaled up ~3% inside a round overflow-hidden wrapper
 * (no white square corners), and a 2px black separation ring keeps it crisp
 * against dark surfaces. No shadows, glows, gradients, or animation.
 */
export function VinnieAvatar({ size = "md", online = false, alt = "" }: Props) {
  const px = SIZES[size];
  const decorative = alt === "";
  return (
    <span className="relative inline-flex shrink-0" data-testid="vinnie-avatar" data-size={size} style={{ width: px, height: px }}>
      <span className="block h-full w-full overflow-hidden rounded-full bg-white ring-2 ring-black" aria-hidden={decorative || undefined}>
        <Image
          src={VINNIE_BADGE_SRC}
          alt={alt}
          width={px}
          height={px}
          quality={90}
          draggable={false}
          className="h-full w-full scale-[1.04] rounded-full object-cover"
        />
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
