import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyQuoteRef } from "./financingLink";

/**
 * Links a submitted financing application to the quote whose opaque
 * reference the /financing page carried. The link is metadata only: it
 * never changes a line, a total, or checkout readiness, and it is never
 * an approval. Best-effort by design: a bad or foreign reference is
 * ignored so the financing application itself always succeeds.
 */
export type LinkOutcome = "linked" | "no_ref" | "invalid_ref" | "not_owner" | "not_found" | "error";

async function attachApplication(quoteId: string, applicationId: string, userId: string): Promise<LinkOutcome> {
  const { data: quote, error } = await supabaseAdmin.from("commerce_quotes").select("id, user_id").eq("id", quoteId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!quote) return "not_found";
  if (quote.user_id !== userId) return "not_owner";
  const { error: updateError } = await supabaseAdmin
    .from("commerce_quotes")
    .update({ financing_application_id: applicationId, financing_status: "application_submitted" })
    .eq("id", quoteId)
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);
  return "linked";
}

export async function linkQuoteToApplication(quoteRef: unknown, applicationId: string, userId: string | null): Promise<LinkOutcome> {
  if (typeof quoteRef !== "string" || quoteRef.length === 0) return "no_ref";
  const quoteId = verifyQuoteRef(quoteRef);
  if (!quoteId || !userId) return "invalid_ref";
  try {
    return await attachApplication(quoteId, applicationId, userId);
  } catch (e) {
    console.error("[commerce/financing] quote link failed:", e instanceof Error ? e.message : String(e));
    return "error";
  }
}
