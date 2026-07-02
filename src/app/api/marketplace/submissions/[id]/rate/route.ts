import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { submitRating } from "@/lib/marketplaceRatings";

/**
 * Partner rates the operator on this submission.
 * Only allowed once the operator has accepted (operator_status='accepted').
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const score = Number(body.score);
  const feedback = typeof body.feedback === "string" ? body.feedback : null;
  const tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string") : [];

  if (!Number.isFinite(score) || score < 1 || score > 5) {
    return NextResponse.json({ error: "Score must be 1-5" }, { status: 400 });
  }

  const { data: submission } = await supabaseAdmin
    .from("placement_submissions")
    .select("id, contract_id, partner_id, operator_status")
    .eq("id", id)
    .maybeSingle();
  if (!submission || submission.partner_id !== user.id) return forbidden();
  if (submission.operator_status !== "accepted") {
    return NextResponse.json({ error: "You can only rate the operator after they accept" }, { status: 400 });
  }

  const { data: contract } = await supabaseAdmin
    .from("placement_contracts")
    .select("id, operator_profile_id")
    .eq("id", submission.contract_id)
    .maybeSingle();
  if (!contract?.operator_profile_id) {
    return NextResponse.json({ error: "Operator not yet linked to profile — nothing to rate" }, { status: 400 });
  }

  const result = await submitRating({
    raterType: "partner",
    raterProfileId: user.id,
    rateeType: "operator",
    rateeId: contract.operator_profile_id,
    submissionId: submission.id,
    contractId: contract.id,
    score,
    feedback,
    tags,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await supabaseAdmin.from("placement_submission_activity").insert({
    submission_id: id,
    actor_id: user.id,
    activity_type: "partner_rated_operator",
    description: `Partner rated operator (${score}★)`,
  });

  return NextResponse.json({ ok: true, id: result.ratingId });
}

/**
 * GET returns the partner's own rating on this submission (if any) so the UI
 * can show a "you already rated 5★" state instead of the submit form.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();
  const { id } = await params;

  const { data } = await supabaseAdmin
    .from("placement_ratings")
    .select("id, score, feedback, tags, created_at")
    .eq("rater_profile_id", user.id)
    .eq("submission_id", id)
    .eq("ratee_type", "operator")
    .maybeSingle();

  return NextResponse.json({ rating: data || null });
}
