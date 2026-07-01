import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { marketplaceContractsEnabled } from "@/lib/marketplaceFlags";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!marketplaceContractsEnabled()) return NextResponse.json({ error: "Contracts not enabled" }, { status: 403 });
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const toTier = Number(body.to_tier);
  if (![1, 2, 3].includes(toTier)) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  const reason = String(body.reason || "").trim();

  const { data: contract } = await supabaseAdmin
    .from("placement_contracts")
    .select("tier, status")
    .eq("id", id)
    .single();
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  if (contract.status !== "open" && contract.status !== "in_progress") {
    return NextResponse.json({ error: "Contract not open" }, { status: 400 });
  }
  if (contract.tier === toTier) {
    return NextResponse.json({ error: "Contract already at this tier" }, { status: 400 });
  }

  // Deduplicate — one pending proposal per partner per contract
  const { data: existing } = await supabaseAdmin
    .from("placement_contract_tier_proposals")
    .select("id")
    .eq("contract_id", id)
    .eq("proposed_by", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "You already have a pending tier proposal on this contract" }, { status: 400 });

  const { data: proposal, error } = await supabaseAdmin
    .from("placement_contract_tier_proposals")
    .insert({
      contract_id: id,
      proposed_by: user.id,
      from_tier: contract.tier,
      to_tier: toTier,
      reason: reason || null,
      status: "pending",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("placement_contract_activity").insert({
    contract_id: id,
    actor_id: user.id,
    activity_type: "tier_proposal_created",
    description: `Requested tier bump ${contract.tier} → ${toTier}${reason ? `: ${reason}` : ""}`,
  });

  return NextResponse.json(proposal);
}
