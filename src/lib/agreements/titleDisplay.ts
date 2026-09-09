/**
 * One shared rule for rendering an optional signatory title.
 *
 * operator_title (and similar) is optional. When it is blank the document
 * must OMIT the title fragment cleanly — never render a literal placeholder
 * ("[Title]") and never fabricate a legal title ("Owner", "Member", "CEO",
 * "Authorized Representative", …). Every renderer (admin preview, customer
 * signing page, generated/signed PDF) uses these helpers so they agree.
 */

/** A title is meaningful only when it is a non-whitespace string. */
export function hasMeaningfulTitle(title: unknown): boolean {
  return typeof title === "string" && title.trim().length > 0;
}

/** The trimmed title to render, or null to omit the title entirely.
 *  Never fabricates a value. */
export function displayTitle(title: unknown): string | null {
  return hasMeaningfulTitle(title) ? (title as string).trim() : null;
}

/** "Name, Title" when a title exists, else just "Name". */
export function nameWithTitle(name: string, title: unknown): string {
  const t = displayTitle(title);
  return t ? `${name}, ${t}` : name;
}
