import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "./apiAuth";
import { supabaseAdmin } from "./supabaseAdmin";

export async function getCoffeeUser(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role, coffee_access_enabled, coffee_agreement_signed, coffee_application_status, storefront_tenant_id")
    .eq("id", userId)
    .single();

  return profile ?? null;
}

/**
 * Can this account use the coffee cart/checkout surfaces?
 * Operators need the admin-granted coffee_access_enabled flag; an
 * enrolled storefront customer's enrollment IS their access — they
 * buy their operator's catalog through the same pipeline.
 */
export function hasCoffeePurchaseAccess(user: {
  coffee_access_enabled?: boolean | null;
  storefront_tenant_id?: string | null;
}): boolean {
  return !!user.coffee_access_enabled || !!user.storefront_tenant_id;
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "Coffee services access required" }, { status: 403 });
}
