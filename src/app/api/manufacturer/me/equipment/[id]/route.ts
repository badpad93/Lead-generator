import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { validateListingPricing } from "@/lib/manufacturerOnboarding/equipmentValidation";
import { normalizeEquipmentPayload } from "@/app/api/manufacturer/me/equipment/route";

/**
 * PATCH  /api/manufacturer/me/equipment/[id]
 *   Update a manufacturer-owned listing.
 *
 * DELETE /api/manufacturer/me/equipment/[id]
 *   Soft-delete via status='inactive'. Hard delete only from admin.
 *
 * Cross-tenant safety: every op re-checks
 * machine_listings.manufacturer_partner_id = userId. RLS on
 * machine_listings is public-select, so partner isolation lives in
 * the API layer — see publicShape.ts for the read-side allowlist.
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: listing } = await supabaseAdmin
    .from("machine_listings")
    .select("id, manufacturer_partner_id, wholesale_price_cents, buy_now_price, status")
    .eq("id", id)
    .maybeSingle();
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (listing.manufacturer_partner_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (listing.status === "sold" || listing.status === "rejected") {
    return NextResponse.json({ error: "This listing is locked from further edits." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const normalized = normalizeEquipmentPayload(body);

  const finalCentsForCheck =
    normalized.final_price_cents != null
      ? normalized.final_price_cents
      : listing.buy_now_price != null
      ? Math.round(Number(listing.buy_now_price) * 100)
      : null;
  const wholesaleCentsForCheck =
    normalized.wholesale_price_cents != null
      ? normalized.wholesale_price_cents
      : listing.wholesale_price_cents;

  const check = await validateListingPricing({
    listing_id: id,
    wholesale_price_cents: wholesaleCentsForCheck,
    final_price_cents: finalCentsForCheck,
  });
  if (!check.ok) {
    return NextResponse.json(
      { error: check.reason, code: check.code, margin_cents: check.margin_cents },
      { status: 400 },
    );
  }

  const finalPriceDollars =
    normalized.final_price_cents != null ? normalized.final_price_cents / 100 : undefined;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (normalized.title) patch.title = normalized.title;
  if (normalized.description !== null) patch.description = normalized.description;
  if (normalized.machine_make !== null) patch.machine_make = normalized.machine_make;
  if (normalized.machine_model !== null) patch.machine_model = normalized.machine_model;
  if (normalized.machine_year !== null) patch.machine_year = normalized.machine_year;
  if (normalized.machine_type !== null) patch.machine_type = normalized.machine_type;
  if (normalized.condition !== null) patch.condition = normalized.condition;
  if (normalized.quantity != null) patch.quantity = normalized.quantity;
  if (normalized.sku !== null) patch.sku = normalized.sku;
  if (normalized.wholesale_price_cents !== null) patch.wholesale_price_cents = normalized.wholesale_price_cents;
  if (finalPriceDollars !== undefined) {
    patch.buy_now_price = finalPriceDollars;
    patch.asking_price = finalPriceDollars;
    patch.buy_now_enabled = finalPriceDollars != null;
  }
  if (normalized.msrp_cents !== null) patch.msrp_cents = normalized.msrp_cents;
  if (normalized.lead_time_days !== null) patch.lead_time_days = normalized.lead_time_days;
  if (normalized.manufacturer_shipping_notes !== null) patch.manufacturer_shipping_notes = normalized.manufacturer_shipping_notes;
  if (normalized.listing_warranty_summary !== null) patch.listing_warranty_summary = normalized.listing_warranty_summary;
  if (normalized.spec_sheet_url !== null) patch.spec_sheet_url = normalized.spec_sheet_url;
  if (normalized.brochure_url !== null) patch.brochure_url = normalized.brochure_url;
  if (normalized.video_url !== null) patch.video_url = normalized.video_url;
  if (normalized.dimensions_text !== null) patch.dimensions_text = normalized.dimensions_text;
  if (normalized.weight_lbs !== null) patch.weight_lbs = normalized.weight_lbs;
  if (normalized.electrical_requirements !== null) patch.electrical_requirements = normalized.electrical_requirements;
  if (normalized.temperature_zone !== null) patch.temperature_zone = normalized.temperature_zone;
  if (normalized.payment_system_compatibility !== null) patch.payment_system_compatibility = normalized.payment_system_compatibility;
  if (normalized.software_compatibility !== null) patch.software_compatibility = normalized.software_compatibility;
  if (normalized.certifications !== null) patch.certifications = normalized.certifications;
  if (normalized.city !== null) patch.city = normalized.city;
  if (normalized.state !== null) patch.state = normalized.state;

  // Status transitions the partner may drive: draft → pending_review
  // (submit for admin review), pending_review/changes_requested → draft
  // (pull back for edits), inactive → draft (reactivate a paused
  // listing back into editing). Everything else is admin-only.
  const requestedStatus = typeof body.status === "string" ? body.status : null;
  if (requestedStatus) {
    const from = listing.status as string;
    const allowed: Record<string, string[]> = {
      draft: ["pending_review"],
      pending_review: ["draft"],
      changes_requested: ["draft", "pending_review"],
      inactive: ["draft"],
      approved: ["inactive"],
      active: ["inactive"],
    };
    if (allowed[from]?.includes(requestedStatus)) {
      patch.status = requestedStatus;
    } else {
      return NextResponse.json(
        { error: `Cannot transition status from ${from} to ${requestedStatus}.` },
        { status: 400 },
      );
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from("machine_listings")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ equipment: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: listing } = await supabaseAdmin
    .from("machine_listings")
    .select("id, manufacturer_partner_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (listing.manufacturer_partner_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Hard-delete only from draft; anything past that flips to
  // inactive so the admin still sees the audit trail.
  if (listing.status === "draft") {
    const { error } = await supabaseAdmin.from("machine_listings").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: true });
  }

  const { error } = await supabaseAdmin
    .from("machine_listings")
    .update({ status: "inactive", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: false, status: "inactive" });
}
