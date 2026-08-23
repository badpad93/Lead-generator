import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

/**
 * GET /api/manufacturer/me/orders
 *   Orders assigned to the caller's manufacturer partner.
 *   Returns purchase rows + minimal buyer detail (name, email, phone,
 *   shipping address). Never returns buyer's payment identifiers.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("machine_listing_purchases")
    .select(
      "id, created_at, updated_at, machine_listing_id, amount_cents, " +
        "manufacturer_proceeds_cents, vc_margin_cents, " +
        "wholesale_price_cents_at_purchase, shipping_cents_at_purchase, " +
        "fulfillment_status, acknowledged_at, estimated_ship_date, shipped_at, delivered_at, cancelled_at, " +
        "carrier, tracking_number, bill_of_lading_storage_path, serial_numbers, fulfillment_notes, issue_reason, " +
        "payment_settled_at, manufacturer_payout_status, payout_released_at, payout_error, " +
        "full_name, email, phone, business_name, " +
        "location_business_name, location_address, location_city, location_state, location_zip, " +
        "site_contact_name, site_contact_phone, site_contact_email",
    )
    .eq("manufacturer_partner_id", userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return NextResponse.json({ orders: rows.map(scrubForManufacturer) });
}

function scrubForManufacturer(row: Record<string, unknown>) {
  // Never surface the raw storage path for BOLs; expose a boolean +
  // signed URL is handled by a separate endpoint.
  const { bill_of_lading_storage_path: _bol, ...rest } = row;
  return { ...rest, bol_uploaded: !!_bol };
}
