import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getOperatorUser, forbidden, getOperatorContractIds } from "@/lib/operatorMarketplaceAuth";
import { submitRating } from "@/lib/marketplaceRatings";

/**
 * Operator rates the placement partner for this submission.
 * Only allowed once the operator has accepted.
 * Visibility is 'visible_to_ratee' — the PP sees the rating on their own
 * dashboard aggregate.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOperatorUser(req);
  if (!user) return forbidden();
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const score = Number(body.score);
  const feedback = typeof body.feedback === "string" ? body.feedback : null;
  const tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string") : [];

  if (!Number.isFinite(score) || score < 1 || score > 5) {
    return NextResponse.json({ error: "Score must be 1-5" }, { status: 400 });
  }

  const contractIds = await getOperatorContractIds(user);
  if (contractIds.length === 0) return forbidden();

  const { data: submission } = await supabaseAdmin
    .from("placement_submissions")
    .select("id, contract_id, partner_id, operator_status")
    .eq("id", id)
    .in("contract_id", contractIds)
    .maybeSingle();
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (submission.operator_status !== "accepted") {
    return NextResponse.json({ error: "Only accepted submissions can be rated" }, { status: 400 });
  }

  const result = await submitRating({
    raterType: "operator",
    raterProfileId: user.id,
    rateeType: "partner",
    rateeId: submission.partner_id,
    submissionId: submission.id,
    contractId: submission.contract_id,
    score,
    feedback,
    tags,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await supabaseAdmin.from("placement_submission_activity").insert({
    submission_id: id,
    actor_id: user.id,
    activity_type: "operator_rated_partner",
    description: `Operator rated placement (${score}★)`,
  });

  return NextResponse.json({ ok: true, id: result.ratingId });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOperatorUser(req);
  if (!user) return forbidden();
  const { id } = await params;

  const { data } = await supabaseAdmin
    .from("placement_ratings")
    .select("id, score, feedback, tags, created_at")
    .eq("rater_profile_id", user.id)
    .eq("submission_id", id)
    .eq("ratee_type", "partner")
    .maybeSingle();

  return NextResponse.json({ rating: data || null });
}
