import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { decryptField } from "@/lib/payroll/encryption";

/**
 * POST /api/admin/payroll/profiles/[id]/reveal
 *
 * Admin-only. Returns the plaintext of a specific encrypted field
 * so an authorized admin can transfer it into QuickBooks Payroll
 * one field at a time. Every reveal is audit-logged with the admin
 * id, the field key, and a required `reason` string.
 *
 * Body: { field_key: string, reason: string }
 *
 * The UI is expected to reveal into a modal that auto-clears on
 * dismiss — this endpoint doesn't persist plaintext anywhere.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getSalesUser(req);
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const fieldKey = typeof body?.field_key === "string" ? body.field_key : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!fieldKey) return NextResponse.json({ error: "field_key is required" }, { status: 400 });
  if (!reason || reason.length < 4) {
    return NextResponse.json(
      { error: "A short reason (≥4 chars) is required so the reveal is auditable." },
      { status: 400 },
    );
  }

  const { data: row } = await supabaseAdmin
    .from("payroll_encrypted")
    .select("ciphertext, iv, auth_tag, key_version")
    .eq("profile_id", id)
    .eq("field_key", fieldKey)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Field not found" }, { status: 404 });

  let plaintext: string;
  try {
    plaintext = decryptField(row);
  } catch (err) {
    // Never leak encryption details to the client.
    console.error("[payroll.reveal] decrypt failed:", err);
    return NextResponse.json({ error: "Decryption failed. Contact the platform team." }, { status: 500 });
  }

  await supabaseAdmin.from("payroll_audit_events").insert({
    profile_id: id,
    actor_user_id: actor.id,
    actor_kind: "admin",
    event_type: "sensitive.revealed",
    description: `Admin revealed field '${fieldKey}' for: ${reason.slice(0, 200)}`,
    metadata: { field_key: fieldKey, reason: reason.slice(0, 200) },
  });

  return NextResponse.json({ ok: true, field_key: fieldKey, plaintext });
}
