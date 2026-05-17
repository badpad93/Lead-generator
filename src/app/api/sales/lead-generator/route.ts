import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";
import { searchBusinesses } from "@/lib/placesApi";
import { createLeadSheet, LeadRow } from "@/lib/googleSheets";

const INDUSTRIES = [
  "warehouses",
  "manufacturing",
  "logistics",
  "distribution centers",
  "auto dealerships",
  "collision centers",
  "office buildings",
  "medical offices",
  "private schools",
];

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ industries: INDUSTRIES });
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Only admins/DOS/market leaders can generate leads" }, { status: 403 });
  }

  const body = await req.json();
  const { city, state, industry, radius, lead_count, assigned_to, list_name } = body;

  if (!city || !state || !industry) {
    return NextResponse.json({ error: "city, state, and industry are required" }, { status: 400 });
  }

  const maxResults = Math.min(Number(lead_count) || 40, 60);
  const title = list_name?.trim() || `${city}_${industry.replace(/\s+/g, "_")}_Leads`;

  // Create a placeholder record with "generating" status
  const { data: listRecord, error: insertErr } = await supabaseAdmin
    .from("sales_call_lists")
    .insert({
      title,
      category: "locations",
      city,
      state,
      industry,
      radius: Number(radius) || null,
      lead_count: 0,
      status: "generating",
      assigned_to: assigned_to || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  try {
    // Search Google Places
    const businesses = await searchBusinesses({ city, state, industry, maxResults });

    if (businesses.length === 0) {
      await supabaseAdmin
        .from("sales_call_lists")
        .update({ status: "failed", description: "No businesses found for this search" })
        .eq("id", listRecord.id);
      return NextResponse.json({ error: "No businesses found for this search criteria", id: listRecord.id }, { status: 404 });
    }

    // Get assigned rep name for the sheet
    let repName = "";
    if (assigned_to) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", assigned_to)
        .single();
      repName = prof?.full_name || "";
    }

    // Get assigned rep email for sharing
    let repEmail: string | undefined;
    if (assigned_to) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", assigned_to)
        .single();
      repEmail = prof?.email || undefined;
    }

    // Build lead rows
    const leads: LeadRow[] = businesses.map((b) => ({
      business_name: b.business_name,
      phone: b.phone,
      email: "",
      website: b.website,
      address: b.address,
      city: b.city,
      state: b.state,
      zip: b.zip,
      industry,
      google_maps_url: b.google_maps_url,
      notes: "",
      assigned_rep: repName,
      call_status: "New",
      last_contacted: "",
    }));

    // Create Google Sheet
    const sheetUrl = await createLeadSheet(title, leads, repEmail);

    // Update the call list record
    await supabaseAdmin
      .from("sales_call_lists")
      .update({
        sheet_url: sheetUrl,
        lead_count: businesses.length,
        status: "active",
      })
      .eq("id", listRecord.id);

    return NextResponse.json({
      id: listRecord.id,
      title,
      sheet_url: sheetUrl,
      lead_count: businesses.length,
      status: "active",
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await supabaseAdmin
      .from("sales_call_lists")
      .update({ status: "failed", description: message })
      .eq("id", listRecord.id);
    return NextResponse.json({ error: message, id: listRecord.id }, { status: 500 });
  }
}
