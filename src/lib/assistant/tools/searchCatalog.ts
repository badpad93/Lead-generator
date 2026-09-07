import { searchCatalogDetailed, type SearchFallback } from "../catalogSearch";
import { assertPublicShape, type SearchCatalogOutput } from "../publicShapes";
import type { ToolContext } from "./context";
import type { SearchCatalogInput } from "./schemas";

const FALLBACK_NOTES: Record<Exclude<SearchFallback, "none">, string> = {
  query_unmatched: "No item matched the search words exactly, so the available catalog items are shown instead.",
  category_unknown: "The category filter did not match any catalog category and was ignored.",
};

export async function runSearchCatalog(input: SearchCatalogInput, ctx: ToolContext): Promise<SearchCatalogOutput> {
  const { items, fallback } = await searchCatalogDetailed(
    input.kind,
    { query: input.query, categorySlug: input.category_slug, limit: input.limit },
    { userId: ctx.profile?.id ?? null, storefront: ctx.storefront },
  );
  const notes: string[] = [];
  if (fallback !== "none") notes.push(FALLBACK_NOTES[fallback]);
  if (input.kind === "location_service") {
    notes.push("Location-service fees are a per-location ladder; the tier for a specific location is assessed by the location team, so no customer-specific quote is produced here.");
  }
  if (items.some((i) => i.display_price === null && i.kind === "coffee")) {
    notes.push("Some items show no price because pricing is not configured for this account; a team member can confirm.");
  }
  if (items.length === 0) notes.push("The catalog returned no items for this request.");
  return assertPublicShape({ kind: input.kind, query: input.query, items, total_returned: items.length, notes });
}
