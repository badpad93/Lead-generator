import { catalogDetails } from "../catalogSearch";
import { assertPublicShape, type CatalogItemDetail } from "../publicShapes";
import type { ToolContext } from "./context";
import type { GetProductDetailsInput } from "./schemas";

export interface GetProductDetailsOutput {
  status: "found" | "not_found";
  item: CatalogItemDetail | null;
}

export async function runGetProductDetails(input: GetProductDetailsInput, ctx: ToolContext): Promise<GetProductDetailsOutput> {
  const items = await catalogDetails(input.kind, [input.product_id], {
    userId: ctx.profile?.id ?? null,
    storefront: ctx.storefront,
  });
  const item = items[0] ?? null;
  return assertPublicShape({ status: item ? "found" : "not_found", item });
}
