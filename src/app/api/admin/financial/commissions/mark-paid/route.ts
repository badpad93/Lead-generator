import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { writeAuditLog } from "@/lib/paymentLedger";

/**
 * POST /api/admin/financial/commissions/mark-paid
 * Body: { ids: string[], note?: string }
 *
 * Flips the given commission_ledger rows from 'earned' (or clearable 'held')
 * to 'paid' and stamps paid_at. This is the human-in-the-loop endpoint that
 * Phase 6 will replace with QB batch payouts.
 */

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((v: unknown) => typeof v === "string") : [];
  const note = body.note ? String(body.note) : null;
  if (ids.length === 0) return NextResponse.json({ error: "No commission ids provided." }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ error: "Too many ids (max 500 per call)." }, { status: 400 });

  const { data: before } = await supabaseAdmin
    .from("commission_ledger")
    .select("id, status, user_id, amount_cents, clearable_at, metadata")
    .in("id", ids);

  const now = new Date();
  const eligibleIds: string[] = [];
  let skipped = 0;
  for (const r of before || []) {
    if (r.status === "earned" || (r.status === "held" && r.clearable_at && new Date(r.clearable_at).getTime() <= now.getTime())) {
      eligibleIds.push(r.id);
    } else {
      skipped++;
    }
  }
  if (eligibleIds.length === 0) return NextResponse.json({ paid: 0, skipped });

  // Preserve earn-time notes (e.g. "Line-level override", "Legacy backfill
  // attribution"). The mark-paid caption lives on metadata.paid_note so the
  // original context isn't destroyed.
  const paidMetadataPatch = note ? { paid_note: note, paid_by: adminId } : { paid_by: adminId };

  // We have to loop to merge metadata per-row — Supabase doesn't do a jsonb
  // deep-merge in a single .update on a list.
  for (const id of eligibleIds) {
    const existing = (before || []).find((b) => b.id === id) as { metadata?: Record<string, unknown> } | undefined;
    const existingMeta = existing?.metadata || {};
    const { error } = await supabaseAdmin
      .from("commission_ledger")
      .update({
        status: "paid",
        paid_at: now.toISOString(),
        metadata: { ...existingMeta, ...paidMetadataPatch },
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const totalCents = (before || [])
    .filter((r) => eligibleIds.includes(r.id))
    .reduce((s, r) => s + Number(r.amount_cents || 0), 0);

  await writeAuditLog({
    actorId: adminId,
    action: "commissions_marked_paid",
    entityType: "commission_ledger",
    reason: note,
    metadata: { ids: eligibleIds, total_cents: totalCents },
  });

  return NextResponse.json({ paid: eligibleIds.length, skipped, total_cents: totalCents });
}
