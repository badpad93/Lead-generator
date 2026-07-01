/**
 * Sanitize a string for pdf-lib's WinAnsi encoder.
 * pdf-lib's default WinAnsi encoding rejects:
 *  - newlines (\n, \r) inside drawText — must be pre-split
 *  - characters outside the WinAnsi range (many curly quotes, emoji, etc.)
 *
 * This helper normalizes common typographic characters, strips control
 * characters, and returns a WinAnsi-safe string.
 */

const REPLACEMENTS: Record<string, string> = {
  // Smart quotes
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  // Dashes
  "–": "-", // en dash
  "—": "-", // em dash
  // Non-breaking space
  " ": " ",
  // Ellipsis
  "…": "...",
  // Bullets
  "•": "-",
  "⁃": "-",
  // Trademarks / registered / copyright — WinAnsi includes these, keep as-is
};

/**
 * For single-line contexts (labels, field values). Strips newlines and
 * replaces them with spaces. Also normalizes typography.
 */
export function pdfSafeInline(input: unknown): string {
  if (input == null) return "";
  let s = String(input);
  for (const [from, to] of Object.entries(REPLACEMENTS)) {
    s = s.split(from).join(to);
  }
  // Collapse any newline variant into a single space
  s = s.replace(/\r\n|\r|\n/g, " ");
  // Strip other control chars
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  // Fallback for any remaining char pdf-lib WinAnsi can't encode
  s = s.replace(/[^\x09\x20-\x7E\xA0-\xFF]/g, "?");
  return s;
}

/**
 * For multiline contexts (notes, paragraphs). Preserves newlines so the
 * caller can split on \n and draw each line separately.
 */
export function pdfSafeMultiline(input: unknown): string {
  if (input == null) return "";
  let s = String(input);
  for (const [from, to] of Object.entries(REPLACEMENTS)) {
    s = s.split(from).join(to);
  }
  s = s.replace(/\r\n|\r/g, "\n");
  // Strip control chars except \n and \t
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  // Fallback for any non-WinAnsi char
  s = s.replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, "?");
  return s;
}
