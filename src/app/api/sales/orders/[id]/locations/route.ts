import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * Sourced locations for a location_services sales order.
 *
 * GET  → list all rows attached to the order (any status)
 * POST → attach one. Two shapes:
 *   { lead_id: "<uuid>" }          — link an existing sales_leads
 *                                    row (entity_type='location').
 *                                    Denormalized fields are copied
 *                                    from the lead at attach time.
 *   { business_name, address, ... } — enter a location manually.
 *                                    No sales_leads row is created;
 *                                    the location lives only on the
 *                                    order snapshot.
 */

interface AttachBody {
  lead_id?: string;
  business_name?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  machine_count?: number;
  machine_type?: string;
  notes?: string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("sales_order_locations")
    .select("*")
    .eq("order_id", id)
    .order("attached_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locations: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json()) as AttachBody;

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .select("id, order_type, order_status")
    .eq("id", id)
    .maybeSingle();
  if (orderErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.order_type !== "location_services") {
    return NextResponse.json(
      { error: "Only location_services orders can source locations" },
      { status: 400 },
    );
  }

  // Build the row. Prefer the lead's denormalized values when a
  // lead_id is provided; the client can override any of them by
  // sending an explicit field alongside lead_id.
  const row: Record<string, unknown> = {
    order_id: id,
    attached_by: user.id,
  };

  if (body.lead_id) {
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("sales_leads")
      .select(
        "id, entity_type, business_name, contact_name, email, phone, address, city, state, zip_code, machine_count, machine_type",
      )
      .eq("id", body.lead_id)
      .maybeSingle();
    if (leadErr || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    if (lead.entity_type && lead.entity_type !== "location") {
      return NextResponse.json(
        { error: `Lead entity_type='${lead.entity_type}' — only location leads can be attached` },
        { status: 400 },
      );
    }
    row.lead_id = lead.id;
    row.business_name = body.business_name ?? lead.business_name;
    row.contact_name = body.contact_name ?? lead.contact_name;
    row.contact_email = body.contact_email ?? lead.email;
    row.contact_phone = body.contact_phone ?? lead.phone;
    row.address = body.address ?? lead.address;
    row.city = body.city ?? lead.city;
    row.state = body.state ?? lead.state;
    row.zip = body.zip ?? lead.zip_code;
    row.machine_count = body.machine_count ?? lead.machine_count ?? 1;
    row.machine_type = body.machine_type ?? lead.machine_type;
  } else {
    if (!body.business_name?.trim()) {
      return NextResponse.json(
        { error: "business_name is required when attaching without a lead_id" },
        { status: 400 },
      );
    }
    row.business_name = body.business_name.trim();
    row.contact_name = body.contact_name ?? null;
    row.contact_email = body.contact_email ?? null;
    row.contact_phone = body.contact_phone ?? null;
    row.address = body.address ?? null;
    row.city = body.city ?? null;
    row.state = body.state ?? null;
    row.zip = body.zip ?? null;
    row.machine_count = body.machine_count ?? 1;
    row.machine_type = body.machine_type ?? null;
  }
  if (body.notes) row.notes = body.notes;

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("sales_order_locations")
    .insert(row)
    .select("*")
    .single();
  if (insertErr) {
    // 23505 = unique violation (order_id + lead_id already exists).
    if ((insertErr as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "That lead is already attached to this order" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "location_attached",
    description: `Sourced location attached: ${inserted.business_name}${inserted.address ? ` (${inserted.address})` : ""}`,
  });

  return NextResponse.json({ location: inserted });
}
