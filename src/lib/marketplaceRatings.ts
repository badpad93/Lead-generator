import { supabaseAdmin } from "./supabaseAdmin";

export type RaterType = "partner" | "operator";
export type RateeType = "partner" | "operator";

export interface SubmitRatingArgs {
  raterType: RaterType;
  raterProfileId: string;
  rateeType: RateeType;
  rateeId: string;
  submissionId: string;
  contractId: string;
  score: number;
  feedback?: string | null;
  tags?: string[];
}

export interface RatingResult {
  ok: boolean;
  error?: string;
  ratingId?: string;
}

/**
 * Rules:
 * - Partners rating operators → admin_only (protects operator reputation).
 * - Operators rating partners → visible_to_ratee (PP sees their own aggregate).
 * - Score 1-5. One rating per rater per submission per ratee_type.
 */
export async function submitRating(args: SubmitRatingArgs): Promise<RatingResult> {
  if (args.score < 1 || args.score > 5) return { ok: false, error: "Score must be 1-5" };

  const visibility = args.rateeType === "operator" ? "admin_only" : "visible_to_ratee";

  const { data, error } = await supabaseAdmin
    .from("placement_ratings")
    .insert({
      rater_type: args.raterType,
      rater_profile_id: args.raterProfileId,
      ratee_type: args.rateeType,
      ratee_id: args.rateeId,
      submission_id: args.submissionId,
      contract_id: args.contractId,
      score: args.score,
      feedback: args.feedback?.trim() || null,
      tags: args.tags || [],
      visibility,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Already rated" };
    return { ok: false, error: error.message };
  }

  await recomputeAggregate(args.rateeType, args.rateeId);
  return { ok: true, ratingId: data.id };
}

/** Recompute + persist the aggregate on the ratee's home table. */
export async function recomputeAggregate(rateeType: RateeType, rateeId: string): Promise<void> {
  const { data: rows } = await supabaseAdmin
    .from("placement_ratings")
    .select("score")
    .eq("ratee_type", rateeType)
    .eq("ratee_id", rateeId);

  const scores = (rows || []).map((r) => Number(r.score)).filter((n) => Number.isFinite(n));
  const count = scores.length;
  const avg = count === 0 ? null : Math.round((scores.reduce((a, b) => a + b, 0) / count) * 100) / 100;

  if (rateeType === "partner") {
    await supabaseAdmin
      .from("placement_partners")
      .update({ rating: avg, rating_count: count, updated_at: new Date().toISOString() })
      .eq("id", rateeId);
  } else {
    await supabaseAdmin
      .from("profiles")
      .update({
        operator_marketplace_rating: avg,
        operator_marketplace_rating_count: count,
      })
      .eq("id", rateeId);
  }
}

/**
 * Ratings a partner is allowed to see about themselves (visible_to_ratee only).
 */
export async function getPartnerVisibleRatings(partnerId: string) {
  const { data } = await supabaseAdmin
    .from("placement_ratings")
    .select("id, score, feedback, tags, submission_id, contract_id, created_at")
    .eq("ratee_type", "partner")
    .eq("ratee_id", partnerId)
    .eq("visibility", "visible_to_ratee")
    .order("created_at", { ascending: false });
  return data || [];
}
