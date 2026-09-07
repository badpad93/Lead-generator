/**
 * Monochrome outlined "V" mark. Decorative: the adjacent text carries the
 * name, so the avatar is hidden from assistive tech.
 */
export function VinnieAvatar({ size = "md" }: { size?: "sm" | "md" }) {
  const dims = size === "sm" ? "h-6 w-6 text-[11px]" : "h-9 w-9 text-sm";
  return (
    <span
      aria-hidden
      data-testid="vinnie-avatar"
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-white font-semibold leading-none text-white ${dims}`}
    >
      V
    </span>
  );
}
