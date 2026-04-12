import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/** PATCH /api/admin/machine-listings/[id] — admin updates a machine listing */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const allowedFields = [
      "title",
      "description",
      "city",
      "state",
      "machine_make",
      "machine_model",
      "machine_year",
      "machine_type",
      "condition",
      "quantity",
      "asking_price",
      "includes_card_reader",
      "includes_install",
      "includes_delivery",
      "photos",
      "image_thumb_url",
      "image_medium_url",
      "image_main_url",
      "contact_email",
      "contact_phone",
      "status",
      "admin_notes",
    ];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("machine_listings")
      .update(updates)
      .eq("id", id)
      .select("*, profiles!created_by(id, full_name, email)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/admin/machine-listings/[id] — admin deletes a machine listing */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("machine_listings")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
