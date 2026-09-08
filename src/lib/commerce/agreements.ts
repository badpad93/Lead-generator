import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireExecutedCoffeeSupplyAgreement } from "@/lib/placementAgreements";
import type { RequiredAgreement } from "./catalog";

/**
 * Agreement gates for quote checkout. Both reuse existing agreement
 * systems; nothing here creates, sends, or signs an agreement.
 *
 *   coffee_supply    the Equipment Loan & Beverage Supply Agreement
 *                    (user_agreements via placementAgreements.ts)
 *   machine_purchase the sales-team machine purchase agreement
 *                    (purchase_agreements, matched to the customer by the
 *                    operator email the sales team recorded; the table has
 *                    no profile id)
 */
export interface AgreementGateResult {
  agreement: RequiredAgreement;
  satisfied: boolean;
  /** Customer-safe explanation when not satisfied. */
  message: string | null;
  /** Where the customer completes it, when self-service exists. */
  href: string | null;
}

export async function coffeeSupplyGate(userId: string): Promise<AgreementGateResult> {
  const block = await requireExecutedCoffeeSupplyAgreement(userId);
  return { agreement: "coffee_supply", satisfied: block === null, message: block, href: block ? "/coffee/agreement" : null };
}

export async function machinePurchaseGate(email: string | null): Promise<AgreementGateResult> {
  const unsatisfied = (message: string): AgreementGateResult => ({ agreement: "machine_purchase", satisfied: false, message, href: null });
  if (!email) return unsatisfied("A signed machine purchase agreement is required before checkout. The sales team sends it.");
  const { data, error } = await supabaseAdmin
    .from("purchase_agreements")
    .select("id, agreement_status")
    .eq("agreement_type", "machine_purchase")
    .eq("agreement_status", "signed")
    .ilike("operator_email", email)
    .limit(1);
  if (error) {
    console.error("[commerce/agreements] purchase_agreements read failed:", error.message);
    return unsatisfied("The machine purchase agreement could not be verified right now. Please try again shortly.");
  }
  if ((data ?? []).length === 0) return unsatisfied("A signed machine purchase agreement is required before checkout. The sales team sends it and it must be fully signed first.");
  return { agreement: "machine_purchase", satisfied: true, message: null, href: null };
}

export function gateFor(agreement: RequiredAgreement, userId: string, email: string | null): Promise<AgreementGateResult> {
  return agreement === "coffee_supply" ? coffeeSupplyGate(userId) : machinePurchaseGate(email);
}
