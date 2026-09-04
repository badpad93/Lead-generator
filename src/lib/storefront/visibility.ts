import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Product ids the storefront owner has hidden from their tenant's
 * storefront (migration 184). One shared reader so the public page,
 * the price list, the quote and the checkout can never disagree on
 * what exists for a given tenant. Best-effort: a read failure hides
 * nothing rather than blanking the catalog.
 */
export async function getHiddenProductIds(tenantId: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabaseAdmin
      .from("storefront_tenant_hidden_products")
      .select("product_id")
      .eq("tenant_id", tenantId);
    if (error) {
      console.error("[storefront/visibility] read failed (treating as none hidden):", error.message);
      return new Set();
    }
    return new Set(((data ?? []) as Array<{ product_id: string }>).map((r) => r.product_id));
  } catch (e) {
    console.error("[storefront/visibility] read failed (treating as none hidden):", e);
    return new Set();
  }
}
