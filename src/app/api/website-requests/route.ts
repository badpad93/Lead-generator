import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

/**
 * GET /api/website-requests — list the caller's own website requests.
 * POST /api/website-requests — create a new draft, prefilling from the
 * caller's profile so the wizard opens with sensible defaults.
 */

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("website_requests")
    .select("id, status, business_name, updated_at, submitted_at, created_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data || [] });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email, phone, company_name, address, city, state, zip")
    .eq("id", userId)
    .maybeSingle();

  const composedAddress = [
    profile?.address,
    profile?.city,
    profile?.state,
    profile?.zip,
  ].filter(Boolean).join(", ") || null;

  const { data, error } = await supabaseAdmin
    .from("website_requests")
    .insert({
      user_id: userId,
      status: "draft",
      business_name: profile?.company_name || null,
      primary_contact: profile?.full_name || null,
      email: profile?.email || null,
      phone: profile?.phone || null,
      business_address: composedAddress,
      inquiry_email: profile?.email || null,
      public_phone: profile?.phone || null,
      business_email: profile?.email || null,
      lead_delivery_destination: "email",
      lead_delivery_email: profile?.email || null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("website_request_activity").insert({
    request_id: data.id,
    actor_id: userId,
    event_type: "created",
    visibility: "internal",
    new_status: "draft",
    message: "Draft created",
  });

  return NextResponse.json({ request: data }, { status: 201 });
}
