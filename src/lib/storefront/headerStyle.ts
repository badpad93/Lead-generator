/**
 * Storefront header presentation — solid color OR uploaded graphic.
 *
 * A storefront admin may keep the existing solid-color header (default) or
 * switch to an uploaded header/banner graphic. This pure resolver decides
 * the EFFECTIVE presentation from the brand fields so the public page, the
 * editor preview, and tests all agree:
 *
 *   - "image" mode applies only when a usable header_image_url is present;
 *     otherwise it falls back to the solid color (a missing / deleted /
 *     not-yet-uploaded graphic never yields a broken header).
 *   - the solid color is ALWAYS resolved and is the background beneath the
 *     image, so an image that 404s at render time still shows the brand color
 *     with no layout shift.
 *   - alt text: a meaningful (non-blank) alt marks the image for assistive
 *     tech; a blank alt means decorative (the header text/nav carry meaning).
 *
 * Pure + env-free (only a type-only React import) so it unit-tests directly
 * and can run in both the server page and the client editor preview.
 */
import type { CSSProperties } from "react";

export type HeaderMode = "color" | "image";

export interface HeaderBrandInput {
  header_mode?: string | null;
  header_image_url?: string | null;
  header_image_alt?: string | null;
  primary_color?: string | null;
  text_color?: string | null;
}

export const DEFAULT_HEADER_COLOR = "#1a1a1a";
export const DEFAULT_HEADER_TEXT = "#f4f0e8";

export interface ResolvedHeader {
  /** Effective mode after the usable-image check. */
  mode: HeaderMode;
  usesImage: boolean;
  backgroundColor: string;
  textColor: string;
  /** The image URL to paint, or null in color mode / when unusable. */
  backgroundImageUrl: string | null;
  /** Meaningful alt, or null when decorative / color mode. */
  altText: string | null;
  /** True when an image is shown with no meaningful alt (decorative). */
  decorative: boolean;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function isHeaderMode(v: unknown): v is HeaderMode {
  return v === "color" || v === "image";
}

/**
 * Resolve the header presentation. `header_mode: "image"` takes effect only
 * with a usable `header_image_url`; everything else resolves to solid color.
 */
/** The usable image URL for image mode, or null (color mode / no usable url). */
function usableHeaderImage(b: HeaderBrandInput): string | null {
  if (b.header_mode !== "image") return null;
  return str(b.header_image_url);
}

export function resolveHeaderPresentation(brand: HeaderBrandInput | null | undefined): ResolvedHeader {
  const b = brand ?? {};
  const imageUrl = usableHeaderImage(b);
  const usesImage = imageUrl !== null;
  const altText = usesImage ? str(b.header_image_alt) : null;
  return {
    mode: usesImage ? "image" : "color",
    usesImage,
    backgroundColor: str(b.primary_color) ?? DEFAULT_HEADER_COLOR,
    textColor: str(b.text_color) ?? DEFAULT_HEADER_TEXT,
    backgroundImageUrl: imageUrl,
    altText,
    decorative: usesImage && altText === null,
  };
}

/**
 * CSS style object for the header container. The solid color is always the
 * base `background`; in image mode the graphic is layered as a cover-fit,
 * centered, non-repeating background on top of that color fallback.
 */
export function headerStyle(resolved: ResolvedHeader): CSSProperties {
  const base: CSSProperties = {
    backgroundColor: resolved.backgroundColor,
    color: resolved.textColor,
  };
  if (resolved.usesImage && resolved.backgroundImageUrl) {
    base.backgroundImage = `url("${resolved.backgroundImageUrl}")`;
    base.backgroundSize = "cover";
    base.backgroundPosition = "center";
    base.backgroundRepeat = "no-repeat";
  }
  return base;
}
