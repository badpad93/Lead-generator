import { catalogDetails } from "../catalogSearch";
import { assertPublicShape, type CompareProductsOutput } from "../publicShapes";
import type { ToolContext } from "./context";
import type { CompareProductsInput } from "./schemas";

/**
 * Side-by-side comparison from public attributes only. No derived
 * savings, totals, or financial math — the rows are the facts and the
 * model may only describe them.
 */
export async function runCompareProducts(input: CompareProductsInput, ctx: ToolContext): Promise<CompareProductsOutput> {
  const unique = Array.from(new Set(input.product_ids));
  const items = await catalogDetails(input.kind, unique, {
    userId: ctx.profile?.id ?? null,
    storefront: ctx.storefront,
  });
  const labels: string[] = [];
  for (const item of items) {
    for (const a of item.attributes) if (!labels.includes(a.label)) labels.push(a.label);
  }
  const notes: string[] = [];
  const missing = unique.length - items.length;
  if (missing > 0) notes.push(`${missing} requested item(s) were not found or are not available.`);
  if (items.length < 2) notes.push("At least two available items are needed for a comparison.");
  return assertPublicShape({ kind: input.kind, items, attribute_labels: labels, notes });
}
