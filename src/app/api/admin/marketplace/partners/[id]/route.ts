import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const [
    { data: partner },
    { data: profile },
    { data: territories },
    { data: industries },
    { data: docs },
    { data: banks },
    { data: activity },
  ] = await Promise.all([
    supabaseAdmin.from("placement_partners").select("*").eq("id", id).maybeSingle(),
    supabaseAdmin.from("profiles").select("id, full_name, email, phone, address, city, state, zip").eq("id", id).maybeSingle(),
    supabaseAdmin.from("placement_territories").select("*").eq("owner_type", "partner").eq("owner_id", id),
    supabaseAdmin.from("placement_industries").select("*").eq("owner_type", "partner").eq("owner_id", id),
    supabaseAdmin.from("placement_partner_documents").select("*").eq("partner_id", id).order("uploaded_at", { ascending: false }),
    supabaseAdmin.from("placement_bank_accounts").select("*").eq("partner_id", id).eq("active", true),
    supabaseAdmin.from("placement_partner_activity").select("*").eq("partner_id", id).order("created_at", { ascending: false }).limit(50),
  ]);

  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

  return NextResponse.json({
    partner,
    profile,
    territories: territories || [],
    industries: industries || [],
    documents: docs || [],
    bank_accounts: banks || [],
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
  const activityEntries: Array<{ activity_type: string; description: string }> = [];

  if (body.action === "verify_identity") {
    updates.identity_verified_at = now;
    activityEntries.push({ activity_type: "identity_verified", description: "Admin verified identity" });
  } else if (body.action === "unverify_identity") {
    updates.identity_verified_at = null;
    activityEntries.push({ activity_type: "identity_unverified", description: "Admin removed identity verification" });
  } else if (body.action === "verify_w9") {
    updates.w9_uploaded_at = now;
    activityEntries.push({ activity_type: "w9_verified", description: "Admin verified W9" });
  } else if (body.action === "verify_bank") {
    updates.bank_verified_at = now;
    activityEntries.push({ activity_type: "bank_verified", description: "Admin verified bank account" });
  } else if (body.action === "sign_agreement") {
    updates.agreement_signed_at = now;
    activityEntries.push({ activity_type: "agreement_countersigned", description: "Admin countersigned platform agreement" });
  } else if (body.action === "activate") {
    updates.active = true;
    activityEntries.push({ activity_type: "activated", description: "Admin activated partner" });
  } else if (body.action === "deactivate") {
    updates.active = false;
    activityEntries.push({ activity_type: "deactivated", description: `Admin deactivated partner${body.reason ? `: ${body.reason}` : ""}` });
  } else if (body.action === "set_capacity") {
    const cap = Math.max(0, Math.floor(Number(body.capacity) || 0));
    updates.capacity = cap;
    activityEntries.push({ activity_type: "capacity_set", description: `Capacity set to ${cap}` });
  } else if (body.action === "set_tier_override") {
    const t = body.tier;
    if (t !== null && t !== "bronze" && t !== "silver" && t !== "gold") {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }
    updates.partner_tier_override = t;
    activityEntries.push({
      activity_type: "tier_override_set",
      description: t ? `Tier pinned to ${t}` : "Tier override cleared (auto-tier resumes)",
    });
  } else if (body.action === "recompute_score") {
    // Manual score recompute — no DB update here; the helper below writes.
    activityEntries.push({ activity_type: "score_recomputed", description: "Admin triggered score recompute" });
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("placement_partners")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const entry of activityEntries) {
    await supabaseAdmin.from("placement_partner_activity").insert({
      partner_id: id,
      actor_id: adminId,
      ...entry,
    });
  }

  // Any tier-override change or explicit recompute → recompute score/tier.
  if (body.action === "set_tier_override" || body.action === "recompute_score") {
    const { recomputePartnerScore } = await import("@/lib/marketplaceScoring");
    await recomputePartnerScore(id);
  }

  return NextResponse.json({ ok: true });
}
