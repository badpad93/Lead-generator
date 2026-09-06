/**
 * Measured PDF layout helpers.
 *
 * pdf-lib draws at absolute coordinates with no wrapping or measuring of
 * its own, so the agreement generator has to measure text before it
 * draws in order to wrap safely, size table rows, and decide page
 * breaks. These pure functions do the measuring; the generator owns the
 * page/cursor and the actual drawing.
 *
 * Kept framework-neutral (only a pdf-lib font for glyph widths) so they
 * are unit-testable and can be reused by other generators without
 * pulling in generator state.
 */

import type { PDFFont } from "pdf-lib";

/** Font-like shape — only what we need to measure a string. Real
 *  pdf-lib PDFFont satisfies this; a stub can too, for tests. */
export interface Measurable {
  widthOfTextAtSize(text: string, size: number): number;
}

/** Break a single token that is itself wider than maxWidth into pieces
 *  that each fit — so a long email, URL or unbroken string can never
 *  run past the margin. */
function hardBreakToken(
  token: string,
  font: Measurable,
  size: number,
  maxWidth: number,
): string[] {
  if (maxWidth <= 0) return [token];
  const pieces: string[] = [];
  let current = "";
  for (const ch of token) {
    const test = current + ch;
    if (current && font.widthOfTextAtSize(test, size) > maxWidth) {
      pieces.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) pieces.push(current);
  return pieces.length > 0 ? pieces : [token];
}

/**
 * Word-wrap `text` to `maxWidth`, hard-breaking any word that is wider
 * than the line on its own. Honors caller-provided newlines (each is a
 * forced line break). Never returns a line wider than maxWidth (down to
 * a single character).
 */
export function wrapText(
  text: string,
  font: Measurable,
  size: number,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  const source = String(text ?? "");
  for (const rawLine of source.split("\n")) {
    if (rawLine === "") {
      out.push("");
      continue;
    }
    const words = rawLine.split(/\s+/).filter((w) => w.length > 0);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      // candidate too wide
      if (current) {
        out.push(current);
        current = "";
      }
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        // the word alone overflows — hard-break it
        const pieces = hardBreakToken(word, font, size, maxWidth);
        for (let i = 0; i < pieces.length - 1; i++) out.push(pieces[i]);
        current = pieces[pieces.length - 1] ?? "";
      } else {
        current = word;
      }
    }
    if (current) out.push(current);
  }
  return out.length > 0 ? out : [""];
}

/**
 * Height a wrapped block will occupy: one `lineHeight` per wrapped line.
 * `lineHeight` is the baseline-to-baseline advance the caller uses when
 * drawing (typically fontSize + a few points of leading).
 */
export function measureWrappedHeight(
  text: string,
  font: Measurable,
  size: number,
  maxWidth: number,
  lineHeight: number,
): number {
  return wrapText(text, font, size, maxWidth).length * lineHeight;
}

/** Truncate to fit `maxWidth`, adding an ellipsis. Use ONLY for
 *  non-contractual display labels (e.g. a category tag), never for
 *  substantive contract text — that must wrap via wrapText. */
export function ellipsize(
  text: string,
  font: Measurable,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

/** Convenience for callers holding a real pdf-lib font. */
export function wrapWithFont(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  return wrapText(text, font, size, maxWidth);
}
