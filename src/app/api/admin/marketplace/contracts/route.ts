import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { pricingForTier } from "@/lib/marketplacePricing";

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";

  let query = supabaseAdmin.from("placement_contracts").select("*").order("created_at", { ascending: false });
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const tier = body.tier === 2 || body.tier === 3 ? body.tier : 1;
  const pricing = pricingForTier(tier);

  const contractType = ["single", "multi", "city", "state", "recurring"].includes(body.contract_type)
    ? body.contract_type
    : "multi";

  const insertRow = {
    title,
    tier,
    operator_price: pricing.operator_price,
    partner_payout: pricing.partner_payout,
    platform_fee: pricing.platform_fee,
    machine_type: body.machine_type || "VendEra AI Machine",
    market_state: body.market_state ? String(body.market_state).toUpperCase() : null,
    market_city: body.market_city || null,
    contract_type: contractType,
    locations_needed: Math.max(1, Number(body.locations_needed) || 1),
    deadline_at: body.deadline_at || null,
    source_order_id: body.source_order_id || null,
    source_agreement_id: body.source_agreement_id || null,
    operator_profile_id: body.operator_profile_id || null,
    operator_business_name: body.operator_business_name || null,
    status: body.status === "open" ? "open" : "draft",
    notes: body.notes || null,
    created_by: adminId,
  };

  const { data: contract, error } = await supabaseAdmin
    .from("placement_contracts")
    .insert(insertRow)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Requirements
  const industries: string[] = Array.isArray(body.industries) ? body.industries : [];
  if (industries.length > 0) {
    await supabaseAdmin.from("placement_contract_requirements").insert(
      industries.map((industry) => ({
        contract_id: contract.id,
        industry,
        power_required: body.power_required !== false,
        parking_required: body.parking_required === true,
        min_employees: body.min_employees != null ? Number(body.min_employees) : null,
        min_traffic_score: body.min_traffic_score != null ? Number(body.min_traffic_score) : null,
      })),
    );
  }

  await supabaseAdmin.from("placement_contract_activity").insert({
    contract_id: contract.id,
    actor_id: adminId,
    activity_type: "created",
    description: `Contract created — Tier ${tier} · ${insertRow.locations_needed} location(s) in ${insertRow.market_city || insertRow.market_state || "any"}`,
  });

  return NextResponse.json(contract);
}
