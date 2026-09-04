import { upsertAgreementForOrder } from "@/lib/agreements/sync";

/**
 * THE one way a purchase agreement is created from an order or quote.
 *
 * Quotes, orders and agreements each live on their own page, but
 * agreements have exactly ONE set of rails: /sales/agreements +
 * /api/sales/agreements. Both entry points call this — POST
 * /api/sales/agreements with { order_id }, and the order-scoped POST
 * /api/sales/orders/[id]/agreement, which delegates here — so the two
 * can never diverge.
 *
 * The derivation itself lives in src/lib/agreements/sync.ts, which
 * builds the agreement from line_items_snapshot rather than from the
 * scalar columns. That matters because the scalar shape could only
 * ever express machines, locations and freight: coffee, coolers,
 * financing and any custom line were dropped on the way in, dropped
 * again on the way back out, and never appeared in the signed PDF.
 *
 * It is also idempotent — an order has at most one live agreement, so
 * calling this twice refreshes the draft instead of stacking a second
 * contract on the same order, and an agreement the customer has
 * already received comes back untouched.
 *
 * The coffee / 10-10-10 gate that used to guard this function is gone.
 * Every order gets an agreement now, and the document tailors its
 * schedules to what was actually sold.
 */
export class AgreementCreationError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "AgreementCreationError";
  }
}

export async function createAgreementFromOrder(input: {
  orderId: string;
  userId: string;
}): Promise<Record<string, unknown>> {
  const result = await upsertAgreementForOrder(input.orderId, input.userId);

  if (!result.ok || !result.agreement) {
    const reason = result.reason ?? "Could not generate the agreement";
    const status = reason === "Order not found" ? 404 : 400;
    throw new AgreementCreationError(status, reason);
  }

  return result.agreement;
}
