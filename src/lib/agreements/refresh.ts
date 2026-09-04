import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { upsertAgreementForOrder } from "@/lib/agreements/sync";

/**
 * Keep a draft agreement in step with the order it was built from.
 *
 * Called after any line-item change. An agreement the customer has
 * already received (sent / viewed / signed) is deliberately left alone
 * — rewriting a contract someone is looking at, or has signed, would be
 * worse than letting it drift. Those surface a "source order has
 * changed" state instead.
 *
 * Always non-fatal: a failure here must never break the item edit the
 * rep just made.
 */
export async function refreshAgreementForOrder(
  orderId: string,
  userId: string,
): Promise<void> {
  try {
    const { data: agreement } = await supabaseAdmin
      .from("purchase_agreements")
      .select("id, agreement_status")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!agreement) return;
    if (!["draft", "generated"].includes(String(agreement.agreement_status))) return;

    await upsertAgreementForOrder(orderId, userId);
  } catch (e) {
    console.error("[agreements/refresh] non-fatal:", e);
  }
}
