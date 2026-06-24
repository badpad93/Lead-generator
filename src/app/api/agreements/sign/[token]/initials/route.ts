import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const REQUIRED_SECTIONS = [
  "section_3",
  "section_4",
  "section_5",
  "section_6",
  "section_7",
  "section_8",
  "schedule_a",
  "schedule_b",
  "schedule_c",
];

/* ------------------------------------------------------------------ */
/*  POST — Save initials for a section (public, token-based auth)     */
/* ------------------------------------------------------------------ */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Look up agreement by token
  const { data: agreement, error: agErr } = await supabaseAdmin
    .from("purchase_agreements")
    .select("id, agreement_status")
    .eq("sign_token", token)
    .single();

  if (agErr || !agreement) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  if (["cancelled", "expired", "signed"].includes(agreement.agreement_status)) {
    return NextResponse.json(
      { error: "This agreement cannot be modified" },
      { status: 400 },
    );
  }

  const body = await req.json();
  const { section_key, initials_data } = body;

  if (!section_key || typeof section_key !== "string") {
    return NextResponse.json(
      { error: "section_key is required" },
      { status: 400 },
    );
  }

  if (!initials_data || typeof initials_data !== "string" || initials_data.trim() === "") {
    return NextResponse.json(
      { error: "initials_data is required" },
      { status: 400 },
    );
  }

  // Get IP address for audit trail
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  // Upsert initials (unique on agreement_id + section_key + signer_type)
  const { data: initial, error: upsertErr } = await supabaseAdmin
    .from("agreement_initials")
    .upsert(
      {
        agreement_id: agreement.id,
        section_key,
        signer_type: "operator",
        initials_data: initials_data.trim(),
        ip_address: ip,
        initialed_at: new Date().toISOString(),
      },
      { onConflict: "agreement_id,section_key,signer_type" },
    )
    .select("*")
    .single();

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // Check if all 9 required sections are now initialed
  const { count } = await supabaseAdmin
    .from("agreement_initials")
    .select("*", { count: "exact", head: true })
    .eq("agreement_id", agreement.id)
    .eq("signer_type", "operator")
    .in("section_key", REQUIRED_SECTIONS);

  const allRequired = count === REQUIRED_SECTIONS.length;

  // If all required sections are initialed, update status if not already partially_signed or signed
  if (
    allRequired &&
    !["partially_signed", "signed"].includes(agreement.agreement_status)
  ) {
    await supabaseAdmin
      .from("purchase_agreements")
      .update({
        agreement_status: "partially_signed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", agreement.id);
  }

  // Log activity
  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: agreement.id,
    activity_type: "initialed",
    description: `Operator initialed ${section_key}`,
  });

  return NextResponse.json({
    ok: true,
    initial,
    all_required_initialed: allRequired,
    initialed: count || 0,
    required: REQUIRED_SECTIONS.length,
  });
}
