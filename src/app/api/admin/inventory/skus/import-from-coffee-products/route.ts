import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * POST /api/admin/inventory/skus/import-from-coffee-products
 *
 * One-click bulk import: for every coffee_products row that doesn't
 * already have a matching inventory_skus (linked by coffee_product_id
 * or by sku_code collision), create one. Uses coffee_products.sku as
 * the SKU code, name, description, unit, min_order_qty (as pack_size),
 * and active flag. Category defaults to "coffee".
 *
 * Idempotent — running twice creates nothing the second time. Returns
 * per-row outcomes so the UI can show "created N, skipped N already
 * linked, N had SKU code collisions".
 */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Every coffee product.
  const { data: products, error: pErr } = await supabaseAdmin
    .from("coffee_products")
    .select("id, sku, name, description, unit, min_order_qty, active")
    .order("name", { ascending: true });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  const productList = (products ?? []) as Array<{
    id: string;
    sku: string;
    name: string;
    description: string | null;
    unit: string | null;
    min_order_qty: number | null;
    active: boolean;
  }>;

  if (productList.length === 0) {
    return NextResponse.json({
      total_products: 0,
      created: 0,
      skipped_already_linked: 0,
      skipped_sku_conflict: 0,
      errors: [],
    });
  }

  // What's already linked or code-taken?
  const { data: existingSkusData } = await supabaseAdmin
    .from("inventory_skus")
    .select("id, sku_code, coffee_product_id");
  const existingSkus = (existingSkusData ?? []) as Array<{
    id: string;
    sku_code: string;
    coffee_product_id: string | null;
  }>;
  const linkedProductIds = new Set(
    existingSkus.map((s) => s.coffee_product_id).filter(Boolean) as string[],
  );
  const takenSkuCodes = new Set(existingSkus.map((s) => s.sku_code.toLowerCase()));

  let created = 0;
  let skippedAlreadyLinked = 0;
  let skippedSkuConflict = 0;
  const errors: Array<{ product_id: string; product_name: string; reason: string }> = [];

  for (const p of productList) {
    if (linkedProductIds.has(p.id)) {
      skippedAlreadyLinked += 1;
      continue;
    }
    if (takenSkuCodes.has(p.sku.toLowerCase())) {
      // Another inventory SKU already claims this code but isn't linked
      // to this product — surface it rather than silently overwrite.
      skippedSkuConflict += 1;
      errors.push({
        product_id: p.id,
        product_name: p.name,
        reason: `sku_code "${p.sku}" already taken by a non-linked inventory SKU — link manually`,
      });
      continue;
    }

    const { error } = await supabaseAdmin.from("inventory_skus").insert({
      sku_code: p.sku,
      name: p.name,
      description: p.description ?? null,
      category: "coffee",
      unit_of_measure: p.unit ?? "each",
      pack_size: Math.max(1, Number(p.min_order_qty ?? 1)),
      coffee_product_id: p.id,
      active: p.active,
      created_by: adminId,
    });
    if (error) {
      errors.push({ product_id: p.id, product_name: p.name, reason: error.message });
    } else {
      created += 1;
    }
  }

  return NextResponse.json({
    total_products: productList.length,
    created,
    skipped_already_linked: skippedAlreadyLinked,
    skipped_sku_conflict: skippedSkuConflict,
    errors,
  });
}
