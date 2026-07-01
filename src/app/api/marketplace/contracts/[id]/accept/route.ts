import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { marketplaceContractsEnabled } from "@/lib/marketplaceFlags";
import { isPartnerEligibleForContract } from "@/lib/marketplaceEligibility";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!marketplaceContractsEnabled()) return NextResponse.json({ error: "Contracts not enabled" }, { status: 403 });
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();
  const { id } = await params;

  const eligibility = await isPartnerEligibleForContract(user.id, id);
  if (!eligibility.eligible) {
    return NextResponse.json({ error: "Not eligible", reasons: eligibility.reasons }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const slotsRequested = Math.max(1, Math.floor(Number(body.slots) || 1));

  // Insert acceptance (unique constraint on contract_id + partner_id protects
  // against double-accept)
  const { error: acceptErr } = await supabaseAdmin
    .from("placement_contract_acceptances")
    .insert({
      contract_id: id,
      partner_id: user.id,
      slots_locked: slotsRequested,
    });
  if (acceptErr) return NextResponse.json({ error: acceptErr.message }, { status: 500 });

  // Move contract to in_progress if it was 'open'
  const { data: contract } = await supabaseAdmin
    .from("placement_contracts")
    .select("status, locations_needed, locations_filled")
    .eq("id", id)
    .single();

  if (contract && contract.status === "open") {
    await supabaseAdmin
      .from("placement_contracts")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  await supabaseAdmin.from("placement_contract_activity").insert({
    contract_id: id,
    actor_id: user.id,
    activity_type: "accepted",
    description: `Partner accepted (${slotsRequested} slot${slotsRequested === 1 ? "" : "s"})`,
  });

  return NextResponse.json({ ok: true });
}
