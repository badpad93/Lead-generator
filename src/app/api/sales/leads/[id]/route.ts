import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("sales_leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  let assigned_profile = null;
  if (data?.assigned_to) {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", data.assigned_to)
      .single();
    assigned_profile = prof || null;
  }
  return NextResponse.json({ ...data, assigned_profile });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const allowed = [
    "business_name",
    "contact_name",
    "phone",
    "email",
    "address",
    "city",
    "state",
    "status",
    "source",
    "notes",
    "do_not_call",
    "last_contacted_at",
    "next_followup_at",
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // Assign/reassign — admin only
  if ("assigned_to" in body) {
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Only admin can assign leads" }, { status: 403 });
    }
    updates.assigned_to = body.assigned_to;
  }

  const { data, error } = await supabaseAdmin
    .from("sales_leads")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** POST to claim a lead (sales user) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  if (body.action === "claim") {
    // Check if already assigned
    const { data: lead } = await supabaseAdmin
      .from("sales_leads")
      .select("assigned_to")
      .eq("id", id)
      .single();

    if (lead?.assigned_to) {
      return NextResponse.json({ error: "Lead already assigned" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("sales_leads")
      .update({ assigned_to: user.id })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "convert") {
    // Convert lead to deal
    const { data: lead } = await supabaseAdmin
      .from("sales_leads")
      .select("*")
      .eq("id", id)
      .single();

    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const { data: deal, error } = await supabaseAdmin
      .from("sales_deals")
      .insert({
        lead_id: id,
        assigned_to: lead.assigned_to || user.id,
        stage: "new",
        value: 0,
        business_name: lead.business_name,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mark lead as qualified
    await supabaseAdmin.from("sales_leads").update({ status: "qualified" }).eq("id", id);

    return NextResponse.json({ dealId: deal.id }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  // Sales reps can delete leads they own or created; admins can delete any.
  if (user.role !== "admin") {
    const { data: lead } = await supabaseAdmin
      .from("sales_leads")
      .select("assigned_to, created_by")
      .eq("id", id)
      .single();
    if (!lead || (lead.assigned_to !== user.id && lead.created_by !== user.id)) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }

  // Detach related deals so the FK constraint doesn't block deletion.
  // Activity log rows cascade automatically.
  await supabaseAdmin.from("sales_deals").update({ lead_id: null }).eq("lead_id", id);

  const { error } = await supabaseAdmin.from("sales_leads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
