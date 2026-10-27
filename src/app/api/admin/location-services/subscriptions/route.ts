import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * Admin view + control of recurring location-services subscriptions.
 * GET lists them (newest first) with the locator name; PATCH cancels one,
 * which stops future weekly billing.
 */

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("location_service_subscriptions")
    .select("*, location_service_locators(name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const subs = (data || []).map((s) => ({
    ...s,
    locator_name: (s.location_service_locators as { name?: string } | null)?.name ?? null,
  }));
  return NextResponse.json({ subscriptions: subs });
}

/** PATCH — cancel a subscription (stops future weekly charges). */
export async function PATCH(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = body.subscription_id as string | undefined;
  if (!id) return NextResponse.json({ error: "subscription_id required" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("location_service_subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
