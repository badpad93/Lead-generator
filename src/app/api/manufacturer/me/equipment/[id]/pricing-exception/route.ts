import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { DEFAULT_MAX_MARGIN_CENTS } from "@/lib/manufacturerOnboarding/equipmentValidation";

/**
 * POST /api/manufacturer/me/equipment/[id]/pricing-exception
 *
 * Manufacturer submits a request to run margin > $300 on a specific
 * listing. Payload:
 *   { requested_final_price_dollars, request_reason }
 *
 * Server derives requested_margin from the listing's stored
 * wholesale_price_cents (the manufacturer doesn't get to choose
 * arbitrary numbers). Refuses if the listing isn't owned by the
 * caller or if there's already a pending exception for it.
 * Admin approval endpoint ships in commit 8.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: listing } = await supabaseAdmin
    .from("machine_listings")
    .select("id, manufacturer_partner_id, wholesale_price_cents, buy_now_price")
    .eq("id", id)
    .maybeSingle();
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (listing.manufacturer_partner_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!listing.wholesale_price_cents) {
    return NextResponse.json(
      { error: "Set the manufacturer sale price on the listing first." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const priceDollarsRaw = Number(body.requested_final_price_dollars);
  if (!Number.isFinite(priceDollarsRaw) || priceDollarsRaw <= 0) {
    return NextResponse.json({ error: "Enter a valid requested final price." }, { status: 400 });
  }
  const requestedFinalCents = Math.round(priceDollarsRaw * 100);
  const wholesale = listing.wholesale_price_cents;
  if (requestedFinalCents <= wholesale) {
    return NextResponse.json(
      { error: "Requested final price must exceed the manufacturer sale price." },
      { status: 400 },
    );
  }
  const margin = requestedFinalCents - wholesale;
  if (margin <= DEFAULT_MAX_MARGIN_CENTS) {
    return NextResponse.json(
      { error: `Margin of $${(margin / 100).toFixed(2)} is within the standard $${(DEFAULT_MAX_MARGIN_CENTS / 100).toFixed(2)} cap — no exception needed.` },
      { status: 400 },
    );
  }

  const requestReason =
    typeof body.request_reason === "string" ? body.request_reason.trim().slice(0, 2000) : "";

  // Refuse a second pending request for the same listing; supersede
  // any prior "pending" one instead so admin only sees the current
  // ask.
  await supabaseAdmin
    .from("machine_listing_pricing_exceptions")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("machine_listing_id", id)
    .eq("status", "pending");

  const { data: inserted, error } = await supabaseAdmin
    .from("machine_listing_pricing_exceptions")
    .insert({
      machine_listing_id: id,
      manufacturer_partner_id: userId,
      requested_wholesale_price_cents: wholesale,
      requested_final_price_cents: requestedFinalCents,
      requested_margin_cents: margin,
      request_reason: requestReason || null,
      status: "pending",
    })
    .select("id, status, requested_margin_cents")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ exception: inserted });
}
