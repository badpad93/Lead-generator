import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * Detach a sourced location from an order. Only allowed while the
 * row is still in 'sourced' state — once a location is 'secured'
 * the money math has already been applied, so removing it would
 * require an invoice reversal. Reps can flip the status to
 * 'declined' via PATCH instead if a lead falls through after
 * being marked secured.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; locId: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, locId } = await params;

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("sales_order_locations")
    .select("id, order_id, business_name, status")
    .eq("id", locId)
    .eq("order_id", id)
    .maybeSingle();
  if (fetchErr || !row) {
    return NextResponse.json({ error: "Sourced location not found" }, { status: 404 });
  }
  if (row.status === "secured") {
    return NextResponse.json(
      { error: "Cannot detach a secured location — flip status to 'declined' instead" },
      { status: 409 },
    );
  }

  const { error: delErr } = await supabaseAdmin
    .from("sales_order_locations")
    .delete()
    .eq("id", locId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "location_detached",
    description: `Sourced location removed: ${row.business_name}`,
  });

  return NextResponse.json({ ok: true });
}

/**
 * Patch a sourced location — used for status flips ('declined',
 * 'removed') and light edits. Securing is a separate route
 * because it stamps pricing and can trigger auto-invoicing;
 * unsecuring or declining is a simple status change.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; locId: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, locId } = await params;
  const body = await req.json();

  const allowed = [
    "business_name",
    "contact_name",
    "contact_email",
    "contact_phone",
    "address",
    "city",
    "state",
    "zip",
    "machine_count",
    "machine_type",
    "notes",
    "status",
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  if (updates.status && !["sourced", "secured", "declined", "removed"].includes(updates.status as string)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  // Securing goes through the dedicated /secure endpoint so the
  // pricing snapshot is stamped consistently.
  if (updates.status === "secured") {
    return NextResponse.json(
      { error: "Use POST /locations/:id/secure to secure a location" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("sales_order_locations")
    .update(updates)
    .eq("id", locId)
    .eq("order_id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "location_updated",
    description: `Sourced location updated: ${data.business_name} (${Object.keys(updates).filter((k) => k !== "updated_at").join(", ")})`,
  });

  return NextResponse.json({ location: data });
}
