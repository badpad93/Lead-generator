import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireExecutedCoffeeSupplyAgreement } from "@/lib/placementAgreements";
import type { RequiredAgreement } from "./catalog";

/**
 * Agreement gates for quote checkout. Both reuse existing agreement
 * systems; nothing here creates, sends, or signs an agreement.
 *
 *   coffee_supply    the Equipment Loan & Beverage Supply Agreement
 *                    (user_agreements keyed by the authenticated user id)
 *   machine_purchase the sales-team machine purchase agreement
 *                    (purchase_agreements). Satisfied ONLY by a signed
 *                    row whose operator_id is the authenticated user's
 *                    profile id. A signed agreement that carries no owner
 *                    link (older rows keyed by email alone) is never
 *                    authorised by email: it blocks checkout and asks for
 *                    staff review, because an email string is not an
 *                    immutable identity.
 */
export interface AgreementGateResult {
  agreement: RequiredAgreement;
  satisfied: boolean;
  /** Customer-safe explanation when not satisfied. */
  message: string | null;
  /** Where the customer completes it, when self-service exists. */
  href: string | null;
  /** True when a signed agreement exists but staff must confirm its owner. */
  needs_staff_review: boolean;
}

const SALES_TEAM = "A signed machine purchase agreement is required before checkout. The sales team sends it and it must be fully signed first.";
const STAFF_REVIEW = "A signed machine purchase agreement was found but it is not yet linked to your account. Staff review is required before checkout.";

export async function coffeeSupplyGate(userId: string): Promise<AgreementGateResult> {
  const block = await requireExecutedCoffeeSupplyAgreement(userId);
  return { agreement: "coffee_supply", satisfied: block === null, message: block, href: block ? "/coffee/agreement" : null, needs_staff_review: false };
}

async function signedMachineAgreements(userId: string, email: string | null): Promise<{ owned: number; unlinked: number }> {
  const base = () => supabaseAdmin.from("purchase_agreements").select("id, operator_id").eq("agreement_type", "machine_purchase").eq("agreement_status", "signed");
  const { data: owned, error } = await base().eq("operator_id", userId).limit(1);
  if (error) throw new Error(error.message);
  if ((owned ?? []).length > 0) return { owned: 1, unlinked: 0 };
  if (!email) return { owned: 0, unlinked: 0 };
  const { data: unlinked, error: e2 } = await base().is("operator_id", null).ilike("operator_email", email).limit(1);
  if (e2) throw new Error(e2.message);
  return { owned: 0, unlinked: (unlinked ?? []).length };
}

export async function machinePurchaseGate(userId: string, email: string | null): Promise<AgreementGateResult> {
  const result = (satisfied: boolean, message: string | null, needsReview = false): AgreementGateResult => ({ agreement: "machine_purchase", satisfied, message, href: null, needs_staff_review: needsReview });
  try {
    const found = await signedMachineAgreements(userId, email);
    if (found.owned > 0) return result(true, null);
    if (found.unlinked > 0) return result(false, STAFF_REVIEW, true);
    return result(false, SALES_TEAM);
  } catch (e) {
    console.error("[commerce/agreements] purchase_agreements read failed:", e instanceof Error ? e.message : String(e));
    return result(false, "The machine purchase agreement could not be verified right now. Please try again shortly.");
  }
}

export function gateFor(agreement: RequiredAgreement, userId: string, email: string | null): Promise<AgreementGateResult> {
  return agreement === "coffee_supply" ? coffeeSupplyGate(userId) : machinePurchaseGate(userId, email);
}
