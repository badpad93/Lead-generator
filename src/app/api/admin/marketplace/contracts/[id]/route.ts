import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { pricingForTier } from "@/lib/marketplacePricing";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const [
    { data: contract },
    { data: requirements },
    { data: acceptances },
    { data: tierProposals },
    { data: submissions },
    { data: activity },
  ] = await Promise.all([
    supabaseAdmin.from("placement_contracts").select("*").eq("id", id).maybeSingle(),
    supabaseAdmin.from("placement_contract_requirements").select("*").eq("contract_id", id),
    supabaseAdmin.from("placement_contract_acceptances").select("*").eq("contract_id", id),
    supabaseAdmin.from("placement_contract_tier_proposals").select("*").eq("contract_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("placement_submissions").select("*").eq("contract_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("placement_contract_activity").select("*").eq("contract_id", id).order("created_at", { ascending: false }).limit(50),
  ]);

  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    contract,
    requirements: requirements || [],
    acceptances: acceptances || [],
    tier_proposals: tierProposals || [],
    submissions: submissions || [],
    activity: activity || [],
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  let activityDesc = "Contract updated";

  if (body.action === "open") {
    updates.status = "open";
    activityDesc = "Contract opened for partners";
  } else if (body.action === "cancel") {
    updates.status = "cancelled";
    activityDesc = `Contract cancelled${body.reason ? `: ${body.reason}` : ""}`;
  } else if (body.action === "mark_fulfilled") {
    updates.status = "fulfilled";
    activityDesc = "Contract marked fulfilled";
  } else if (body.action === "set_tier") {
    const tier = Number(body.tier);
    if (![1, 2, 3].includes(tier)) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    const p = pricingForTier(tier);
    updates.tier = tier;
    updates.operator_price = p.operator_price;
    updates.partner_payout = p.partner_payout;
    updates.platform_fee = p.platform_fee;
    activityDesc = `Tier set to ${tier} (PP $${p.partner_payout} / Op $${p.operator_price})`;
  } else if (body.action === "attach_operator") {
    const operatorId = typeof body.operator_profile_id === "string" ? body.operator_profile_id.trim() : "";
    if (!operatorId) {
      // Detach path — clear the link so the operator no longer sees it.
      updates.operator_profile_id = null;
      updates.operator_business_name = null;
      activityDesc = "Operator detached from contract";
    } else {
      const { data: op } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, company_name, role")
        .eq("id", operatorId)
        .maybeSingle();
      if (!op) return NextResponse.json({ error: "Operator profile not found" }, { status: 400 });
      if (op.role !== "operator") return NextResponse.json({ error: "Selected profile is not an operator" }, { status: 400 });
      updates.operator_profile_id = op.id;
      updates.operator_business_name = op.company_name || op.full_name || op.email;
      activityDesc = `Contract attached to operator ${op.company_name || op.full_name || op.email}`;
    }
  } else if (body.action === "set_pricing") {
    // Admin-customizable pricing override — no tier tie-in.
    const parseCents = (v: unknown): number | null => {
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.round(n);
    };
    const op = parseCents(body.operator_price);
    const pp = parseCents(body.partner_payout);
    const pf = parseCents(body.platform_fee);
    if (op == null || pp == null || pf == null || op <= 0) {
      return NextResponse.json({ error: "Prices must be non-negative and operator price positive." }, { status: 400 });
    }
    updates.operator_price = op;
    updates.partner_payout = pp;
    updates.platform_fee = pf;
    activityDesc = `Pricing updated (Op $${op} · PP $${pp} · VC $${pf})`;
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("placement_contracts")
    .update(updates)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("placement_contract_activity").insert({
    contract_id: id,
    actor_id: adminId,
    activity_type: body.action,
    description: activityDesc,
  });

  if (body.action === "open") {
    const { notifyPartnerContractOpened } = await import("@/lib/marketplaceNotifications");
    notifyPartnerContractOpened(id).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
