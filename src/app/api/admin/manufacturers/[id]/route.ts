import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

const ADMIN_ROLES = new Set(["admin", "director_of_sales", "market_leader"]);

/**
 * GET /api/admin/manufacturers/[id]
 *   Full detail — admin sees every column, including admin_notes,
 *   status_reason, dwolla identifiers, etc. Also returns the
 *   equipment list, active agreement metadata, and any pending
 *   pricing exceptions in one payload so the admin page doesn't
 *   round-trip.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user || !ADMIN_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const [{ data: partner }, { data: equipment }, { data: agreements }, { data: exceptions }, { data: orders }] = await Promise.all([
    supabaseAdmin.from("manufacturer_partners").select("*").eq("id", id).maybeSingle(),
    supabaseAdmin
      .from("machine_listings")
      .select(
        "id, title, sku, machine_make, machine_model, machine_type, status, wholesale_price_cents, buy_now_price, quantity, temperature_zone, lead_time_days, created_at, updated_at",
      )
      .eq("manufacturer_partner_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("manufacturer_agreements")
      .select("id, agreement_version, effective_date, signer_printed_name, signer_title, accepted_at, superseded_at, executed_pdf_storage_path")
      .eq("manufacturer_partner_id", id)
      .order("accepted_at", { ascending: false }),
    supabaseAdmin
      .from("machine_listing_pricing_exceptions")
      .select("id, machine_listing_id, status, requested_wholesale_price_cents, requested_final_price_cents, requested_margin_cents, request_reason, approved_max_margin_cents, requested_at, reviewed_at, review_note")
      .eq("manufacturer_partner_id", id)
      .order("requested_at", { ascending: false }),
    supabaseAdmin
      .from("machine_listing_purchases")
      .select("id, machine_listing_id, amount_cents, manufacturer_proceeds_cents, vc_margin_cents, created_at, status")
      .eq("manufacturer_partner_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (!partner) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Deliberately DO NOT include executed_pdf_storage_path or
  // dwolla_funding_source_url in the payload — those flow through
  // signed-URL download endpoints. Everything else is admin-visible.
  const { executed_pdf_storage_path: _pdf, ...rest } = partner as Record<string, unknown> & { executed_pdf_storage_path?: unknown };
  void _pdf;

  return NextResponse.json({
    partner: rest,
    equipment: equipment ?? [],
    agreements: agreements ?? [],
    pending_exceptions: (exceptions ?? []).filter((e) => e.status === "pending"),
    all_exceptions: exceptions ?? [],
    orders: orders ?? [],
    viewer_role: user.role,
  });
}
