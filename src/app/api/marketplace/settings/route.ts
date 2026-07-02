import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";

export async function GET(req: NextRequest) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("notification_preferences")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    notification_preferences: (profile?.notification_preferences || {}) as Record<string, boolean>,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const body = await req.json().catch(() => ({}));
  const prefs = body.notification_preferences;
  if (!prefs || typeof prefs !== "object") {
    return NextResponse.json({ error: "notification_preferences object required" }, { status: 400 });
  }

  // Whitelist keys — anything else is dropped silently.
  const allowedKeys = [
    "partner_contract_opened",
    "partner_submission_reviewed",
    "partner_operator_decided",
    "partner_payout_sent",
    // SMS opt-ins (defaults off — user must explicitly enable)
    "partner_operator_decided_sms",
    "partner_payout_sent_sms",
  ];
  const clean: Record<string, boolean> = {};
  for (const k of allowedKeys) {
    if (typeof prefs[k] === "boolean") clean[k] = prefs[k];
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ notification_preferences: clean })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, notification_preferences: clean });
}
