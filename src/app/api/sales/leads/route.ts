import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { createAndSendAgreement } from "@/lib/locationAgreement";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("sales_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Hydrate assigned profile names from profiles (separate query — sales_leads
  // FK references auth.users, not profiles, so we can't embed via PostgREST).
  const leads = data || [];
  const ids = Array.from(
    new Set(leads.map((l) => l.assigned_to).filter(Boolean))
  ) as string[];

  let nameById: Record<string, { full_name: string | null; email: string | null }> = {};
  if (ids.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    nameById = Object.fromEntries(
      (profiles || []).map((p) => [p.id, { full_name: p.full_name, email: p.email }])
    );
  }

  const hydrated = leads.map((l) => ({
    ...l,
    assigned_profile: l.assigned_to ? nameById[l.assigned_to] || null : null,
  }));

  return NextResponse.json(hydrated);
}

const HOURS_MAP: Record<string, string> = { "8": "low", "12": "medium", "16": "high", "24": "24/7" };

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { business_name, contact_name, phone, email, address, city, state, source, notes, do_not_call, entity_type, immediate_need } = body;
  if (!business_name)
    return NextResponse.json({ error: "business_name required" }, { status: 400 });

  if (entity_type === "location") {
    const missing: string[] = [];
    if (!body.location_name) missing.push("location_name");
    if (!body.industry) missing.push("industry");
    if (!body.zip) missing.push("zip");
    if (!body.employee_count) missing.push("employee_count");
    if (!body.traffic_count) missing.push("traffic_count");
    if (!body.decision_maker_name) missing.push("decision_maker_name");
    if (!body.decision_maker_email) missing.push("decision_maker_email");
    if (!body.machine_type) missing.push("machine_type");
    if (!phone) missing.push("phone");
    if (missing.length > 0) {
      return NextResponse.json({ error: `Required location fields missing: ${missing.join(", ")}` }, { status: 400 });
    }
  }

  const { data: account, error: acctErr } = await supabaseAdmin
    .from("sales_accounts")
    .insert({
      business_name,
      contact_name: contact_name || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      entity_type: entity_type || null,
      assigned_to: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (acctErr) {
    return NextResponse.json({ error: `Account create failed: ${acctErr.message}` }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("sales_leads")
    .insert({
      business_name,
      contact_name,
      phone,
      email,
      address,
      city: city || null,
      state: state || null,
      source: source || null,
      notes: notes || null,
      do_not_call: !!do_not_call,
      entity_type: entity_type || null,
      immediate_need: immediate_need || null,
      created_by: user.id,
      assigned_to: user.id,
      account_id: account.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (entity_type === "location" && data) {
    const bh = HOURS_MAP[body.business_hours] || body.business_hours || "low";
    const { data: location } = await supabaseAdmin
      .from("locations")
      .insert({
        location_name: body.location_name || business_name,
        address: address || null,
        phone: phone || null,
        decision_maker_name: body.decision_maker_name || contact_name || null,
        decision_maker_email: body.decision_maker_email || email || null,
        industry: body.industry || null,
        zip: body.zip || null,
        employee_count: body.employee_count ? Number(body.employee_count) : null,
        traffic_count: body.traffic_count ? Number(body.traffic_count) : null,
        machine_type: body.machine_type || null,
        business_hours: bh,
        machines_requested: body.machines_requested ? Number(body.machines_requested) : 1,
        sales_lead_id: data.id,
      })
      .select("id")
      .single();

    if (location) {
      await supabaseAdmin
        .from("sales_accounts")
        .update({ entity_type: "location" })
        .eq("id", account.id);
    }

    try {
      await createAndSendAgreement(data.id, {
        business_name: body.location_name || business_name,
        contact_name: body.decision_maker_name || contact_name,
        email: body.decision_maker_email || email,
        phone: phone,
        address: address,
      });
    } catch (err) {
      console.error("[leads] Failed to send location agreement on create:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json(data, { status: 201 });
}
