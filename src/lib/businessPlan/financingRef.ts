import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { assistantHashSecret } from "@/lib/assistant/secrets";
import { signQuoteRef } from "@/lib/commerce/financingLink";

/**
 * Opaque, signed plan reference carried to the existing first-party
 * financing application and verified on submission. The return path is
 * fixed (`/financing`): nothing in it is customer-controlled, so it cannot
 * become an open redirect. Sensitive application data never passes
 * through here; only the plan id does.
 */
export const FINANCING_PATH = "/financing";
/** Where a guest is sent to sign in before saving; fixed, never derived from input. */
export const SIGN_IN_PATH = "/login?redirect=/assistant";

export function signPlanRef(planId: string, env: Record<string, string | undefined> = process.env): string {
  const sig = createHmac("sha256", assistantHashSecret(env)).update(`plan:${planId}`).digest("base64url").slice(0, 32);
  return `${planId}.${sig}`;
}

export function verifyPlanRef(ref: string | null | undefined, env: Record<string, string | undefined> = process.env): string | null {
  if (!ref || ref.indexOf(".") !== 36) return null;
  const planId = ref.slice(0, 36);
  const a = Buffer.from(ref);
  const b = Buffer.from(signPlanRef(planId, env));
  return a.length === b.length && timingSafeEqual(a, b) ? planId : null;
}

/** The fixed financing path with the signed plan reference (and the quote reference when the plan has a quote). */
export function financingPlanUrl(planId: string, quoteId: string | null): string {
  const params = new URLSearchParams({ plan: signPlanRef(planId) });
  if (quoteId) params.set("quote", signQuoteRef(quoteId));
  return `${FINANCING_PATH}?${params.toString()}`;
}

export type PlanLinkOutcome = "linked" | "no_ref" | "invalid_ref" | "not_owner" | "not_found" | "error";

async function attach(planId: string, applicationId: string, userId: string): Promise<PlanLinkOutcome> {
  const { data, error } = await supabaseAdmin.from("commerce_business_plans").select("id, user_id").eq("id", planId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return "not_found";
  if (data.user_id !== userId) return "not_owner";
  const { error: updateError } = await supabaseAdmin
    .from("commerce_business_plans")
    .update({ financing_application_id: applicationId, financing_status: "application_submitted" })
    .eq("id", planId)
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);
  return "linked";
}

/** Best-effort, metadata only: never a price change, never an approval. Ownership is re-checked here. */
export async function linkPlanToApplication(planRef: unknown, applicationId: string, userId: string | null): Promise<PlanLinkOutcome> {
  if (typeof planRef !== "string" || planRef.length === 0) return "no_ref";
  const planId = verifyPlanRef(planRef);
  if (!planId || !userId) return "invalid_ref";
  try {
    return await attach(planId, applicationId, userId);
  } catch (e) {
    console.error("[businessPlan/financing] plan link failed:", e instanceof Error ? e.message : String(e));
    return "error";
  }
}
