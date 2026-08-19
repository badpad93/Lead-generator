import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashToken } from "@/lib/contractorOnboarding/token";

/**
 * Contractor-facing onboarding endpoint.
 *
 * GET returns a whitelist of fields safe to render on the portal.
 * Server-side status transitions happen here: sent → opened on first
 * successful fetch, opened/sent → in_progress on first PATCH.
 *
 * PATCH accepts a partial merge into step_data + an optional
 * current_step advance. Autosave calls this on every debounced write.
 *
 * NO ADMIN AUTH — access is authorized purely by knowledge of the raw
 * token. Server verifies via constant-time hash comparison. Locked
 * packets return a completion signal instead of editable state.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const row = await lookupByToken(token);
  if (!row) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });

  // Expiry check — refuse to render editable state on an expired
  // link. Admin can resend to regenerate.
  if (
    row.status !== "completed" &&
    row.token_expires_at &&
    new Date(row.token_expires_at) < new Date()
  ) {
    if (row.status !== "expired") {
      await supabaseAdmin
        .from("contractor_onboarding")
        .update({ status: "expired" })
        .eq("id", row.id);
    }
    return NextResponse.json({ error: "This onboarding link has expired.", expired: true }, { status: 410 });
  }

  if (row.status === "revoked") {
    return NextResponse.json({ error: "This onboarding link has been cancelled." }, { status: 410 });
  }

  // Stamp first_opened_at + advance status once, only.
  if (row.status === "sent") {
    await supabaseAdmin
      .from("contractor_onboarding")
      .update({ status: "opened", first_opened_at: new Date().toISOString() })
      .eq("id", row.id);
    row.status = "opened";
  }

  return NextResponse.json({ onboarding: sanitizeForContractor(row) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const row = await lookupByToken(token);
  if (!row) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  if (row.locked || row.status === "completed") {
    return NextResponse.json({ error: "This packet has been submitted and is now locked." }, { status: 409 });
  }
  if (row.status === "revoked" || row.status === "expired") {
    return NextResponse.json({ error: "This onboarding link is no longer active." }, { status: 410 });
  }

  const body = await req.json().catch(() => ({}));
  const stepDataPatch = body.step_data && typeof body.step_data === "object" ? body.step_data : null;
  const currentStepRaw = body.current_step;

  const nextStepData = stepDataPatch
    ? { ...(row.step_data as Record<string, unknown>), ...stepDataPatch }
    : row.step_data;

  const patch: Record<string, unknown> = {
    step_data: nextStepData,
    updated_at: new Date().toISOString(),
  };

  if (typeof currentStepRaw === "number" && currentStepRaw >= 1 && currentStepRaw <= 8) {
    patch.current_step = Math.max(row.current_step ?? 1, Math.floor(currentStepRaw));
  }

  // First autosave transitions the record into in_progress.
  if (row.status === "sent" || row.status === "opened") {
    patch.status = "in_progress";
    patch.started_at = row.started_at ?? new Date().toISOString();
    if (!row.first_opened_at) patch.first_opened_at = new Date().toISOString();
  }

  const { data: updated, error } = await supabaseAdmin
    .from("contractor_onboarding")
    .update(patch)
    .eq("id", row.id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Save failed" }, { status: 500 });
  }
  return NextResponse.json({ onboarding: sanitizeForContractor(updated) });
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

interface OnboardingRow {
  id: string;
  contractor_email: string;
  contractor_name: string | null;
  start_date: string;
  status: string;
  token_hash: string;
  token_expires_at: string;
  step_data: Record<string, unknown>;
  current_step: number;
  agreement_version: string;
  first_opened_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  locked: boolean;
  w9_uploaded_at: string | null;
  w9_original_filename: string | null;
  dwolla_verified_at: string | null;
}

async function lookupByToken(rawToken: string): Promise<OnboardingRow | null> {
  const hash = hashToken(rawToken);
  const { data } = await supabaseAdmin
    .from("contractor_onboarding")
    .select(
      "id, contractor_email, contractor_name, start_date, status, token_hash, token_expires_at, step_data, current_step, agreement_version, first_opened_at, started_at, completed_at, locked, w9_uploaded_at, w9_original_filename, dwolla_verified_at",
    )
    .eq("token_hash", hash)
    .maybeSingle();
  return (data as OnboardingRow | null) ?? null;
}

function sanitizeForContractor(row: OnboardingRow) {
  // Fields the contractor's own browser can see. Deliberately no
  // token_hash, no admin-only fields, no dwolla_customer_id (just
  // the "verified" boolean), no W-9 storage path (just the filename
  // + "received" flag).
  return {
    id: row.id,
    contractor_email: row.contractor_email,
    contractor_name: row.contractor_name,
    start_date: row.start_date,
    status: row.status,
    step_data: row.step_data,
    current_step: row.current_step,
    agreement_version: row.agreement_version,
    completed_at: row.completed_at,
    locked: row.locked,
    w9_received: !!row.w9_uploaded_at,
    w9_original_filename: row.w9_original_filename,
    payment_verified: !!row.dwolla_verified_at,
  };
}
