import { isAssistantCheckoutEnabled, isAssistantCheckoutPublicEnabled } from "@/lib/assistant/flags";
import { isVerifiedAdmin } from "./adminAccess";
import type { CheckoutAccess } from "./checkout";
import { vinnieQuickBooksGate } from "./quickbooksAdapter";
import { QuoteError } from "./quoteTypes";

/**
 * Resolve who may check out: both flags from the database, administrator
 * status from authoritative server-side data, and the deployment
 * environment. Nothing here comes from the request.
 *
 *   checkout_enabled=false                  nobody
 *   checkout_enabled=true, public=false     verified administrators only
 *   checkout_enabled=true, public=true      eligible authenticated customers
 */
export async function checkoutAccessFor(userId: string): Promise<CheckoutAccess> {
  const [checkoutEnabled, publicEnabled] = await Promise.all([isAssistantCheckoutEnabled(), isAssistantCheckoutPublicEnabled()]);
  const isAdmin = checkoutEnabled && !publicEnabled ? await isVerifiedAdmin(userId) : false;
  return { checkoutEnabled, publicEnabled, isAdmin, environmentAllowed: vinnieQuickBooksGate().allowed };
}

/** Throws unless this caller may create an invoice under the current flags. */
export function assertCheckoutAccess(access: CheckoutAccess): void {
  if (!access.checkoutEnabled) throw new QuoteError("checkout_disabled", "Checkout is not available yet.");
  if (!access.publicEnabled && !access.isAdmin) throw new QuoteError("checkout_disabled", "Checkout is currently limited to administrators. Your quote is saved.");
}
