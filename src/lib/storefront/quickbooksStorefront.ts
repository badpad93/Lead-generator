/**
 * QuickBooks helpers specific to the coffee storefront pipeline.
 *
 * All storefront sales are RESALE = tax-exempt at VC -> customer
 * (per spec § "Tax Configuration"): the customer record is created
 * with Taxable=false + the account's resale exemption reason, and
 * /api/coffee/checkout pre-creates it before its normal hardened
 * createInvoice path (which finds customers by email) so storefront
 * invoices land on the exempt customer.
 *
 * The bespoke invoice/sales-receipt/item-catalog builders that once
 * lived here served the retired /api/storefront/checkout route and
 * were deleted when storefront checkout collapsed onto the base
 * coffee pipeline.
 */
import {
  qbApi,
  findCustomerByEmail,
  findCustomerByName,
  createCustomer,
  type QBCustomer,
} from "@/lib/quickbooks";

// ─── Resale-exempt customer ───────────────────────────────────────

/**
 * Storefront customers are always resale = tax-exempt in QBO. This
 * mirrors findOrCreateCustomer but additionally stamps
 * Taxable=false + TaxExemptionReasonId (per your QBO account's
 * "Resale" reason id, provided via env). Idempotent — if the
 * customer already exists with the right flags we return it as-is.
 */
export async function findOrCreateResaleExemptCustomer(params: {
  displayName: string;
  email: string;
  phone?: string;
  resaleCertificateNumber?: string | null;
}): Promise<QBCustomer> {
  const existing =
    (await findCustomerByEmail(params.email)) ??
    (await findCustomerByName(params.displayName));
  if (existing) return existing;

  const exemptionReasonId = process.env.QB_RESALE_TAX_EXEMPTION_REASON_ID ?? "5";

  const body: Record<string, unknown> = {
    DisplayName: params.displayName,
    PrimaryEmailAddr: { Address: params.email },
    Taxable: false,
    TaxExemptionReasonId: exemptionReasonId,
  };
  if (params.phone) body.PrimaryPhone = { FreeFormNumber: params.phone };
  if (params.resaleCertificateNumber) {
    body.Notes = `Resale cert: ${params.resaleCertificateNumber}`;
  }

  const res = await qbApi("/customer", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    // Fall back to plain create on any exemption field rejection so
    // the sale still books; log for reconciliation.
    if (text.includes("TaxExemptionReasonId") || text.includes("Taxable")) {
      console.warn("[qbStorefront] resale flags rejected, falling back to plain customer", text);
      return createCustomer({
        displayName: params.displayName,
        email: params.email,
        phone: params.phone,
      });
    }
    throw new Error(`QB create resale-exempt customer failed: ${text}`);
  }
  return ((await res.json()) as { Customer: QBCustomer }).Customer;
}
