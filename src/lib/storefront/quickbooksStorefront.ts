/**
 * QuickBooks helpers specific to the coffee storefront pipeline.
 *
 * Vending Connector stays seller of record for every storefront
 * transaction — the QBO ledger books:
 *   Sale        (revenue)    invoice / sales receipt to the customer
 *   Cost / COGS (expense)    base price recognized against the operator
 *   Payable     (bill)       commission owed to the operator, later paid
 *                            via QB Bill Pay
 *
 * All storefront sales are RESALE = tax-exempt at VC -> customer
 * (per spec § "Tax Configuration"). This module always stamps
 * TaxCodeRef=NON so QBO's Automated Sales Tax engine does NOT add
 * tax to line items.
 *
 * Per-product QBO Item catalog rows are created on-demand and cached
 * back onto coffee_products.qb_item_id so subsequent orders reuse
 * the same catalog id and QBO reports line up by product.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  qbApi,
  findCustomerByEmail,
  findCustomerByName,
  createCustomer,
  type QBCustomer,
} from "@/lib/quickbooks";
import { round2, type ResolvedCart } from "@/lib/storefront/pricing";

const TAX_CODE_NON = "NON";
const DEFAULT_INCOME_ACCOUNT_ENV = "QB_STOREFRONT_INCOME_ACCOUNT_ID";
const DEFAULT_ASSET_ACCOUNT_ENV = "QB_STOREFRONT_ASSET_ACCOUNT_ID";
const DEFAULT_EXPENSE_ACCOUNT_ENV = "QB_STOREFRONT_EXPENSE_ACCOUNT_ID";

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

// ─── Item catalog ─────────────────────────────────────────────────

export interface QBItem {
  Id: string;
  Name: string;
  Sku?: string;
  UnitPrice?: number;
  SyncToken: string;
}

export interface EnsureQbItemInput {
  productId: string;
  name: string;
  sku: string;
  incomeAccountId?: string | null;
  assetAccountId?: string | null;
  expenseAccountId?: string | null;
  unitPrice?: number | null;
}

/**
 * Look up or create a QBO Item row for a coffee_products entry, and
 * write the resulting Id back onto coffee_products.qb_item_id so
 * subsequent invoices/sales receipts can reference the same catalog
 * item and QBO product reports roll up cleanly.
 *
 * Tax code is NON on the item itself so any line-item defaulting
 * from the item side is also resale-exempt.
 */
export async function ensureQbItemForProduct(input: EnsureQbItemInput): Promise<QBItem> {
  // Reuse cached id if we've already created one.
  const { data: cached } = await supabaseAdmin
    .from("coffee_products")
    .select("qb_item_id")
    .eq("id", input.productId)
    .maybeSingle();
  const cachedId = (cached as { qb_item_id: string | null } | null)?.qb_item_id ?? null;
  if (cachedId) {
    const getRes = await qbApi(`/item/${cachedId}`);
    if (getRes.ok) {
      const data = (await getRes.json()) as { Item: QBItem };
      return data.Item;
    }
  }

  // Look up by name (QBO enforces unique names).
  const qName = input.name.replace(/'/g, "\\'");
  const queryRes = await qbApi(
    `/query?query=${encodeURIComponent(`SELECT * FROM Item WHERE Name = '${qName}'`)}`,
  );
  if (queryRes.ok) {
    const data = (await queryRes.json()) as { QueryResponse?: { Item?: QBItem[] } };
    const found = data.QueryResponse?.Item?.[0];
    if (found) {
      await cacheQbItemId(input.productId, found.Id);
      return found;
    }
  }

  const incomeAccountId = input.incomeAccountId ?? process.env[DEFAULT_INCOME_ACCOUNT_ENV];
  const assetAccountId = input.assetAccountId ?? process.env[DEFAULT_ASSET_ACCOUNT_ENV];
  const expenseAccountId = input.expenseAccountId ?? process.env[DEFAULT_EXPENSE_ACCOUNT_ENV];

  const body: Record<string, unknown> = {
    Name: input.name,
    Sku: input.sku,
    Type: "NonInventory",
    Taxable: false,
    SalesTaxCodeRef: { value: TAX_CODE_NON },
    IncomeAccountRef: incomeAccountId ? { value: incomeAccountId } : undefined,
    AssetAccountRef: assetAccountId ? { value: assetAccountId } : undefined,
    ExpenseAccountRef: expenseAccountId ? { value: expenseAccountId } : undefined,
    UnitPrice: input.unitPrice ?? undefined,
  };

  const res = await qbApi("/item", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QB create item failed: ${text}`);
  }
  const created = ((await res.json()) as { Item: QBItem }).Item;
  await cacheQbItemId(input.productId, created.Id);
  return created;
}

async function cacheQbItemId(productId: string, qbItemId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("coffee_products")
      .update({ qb_item_id: qbItemId })
      .eq("id", productId);
  } catch (err) {
    console.warn("[qbStorefront] failed to cache qb_item_id", err);
  }
}

// ─── Storefront invoice / sales receipt ───────────────────────────

export interface StorefrontQbLine {
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  description?: string;
}

export interface CreateStorefrontInvoiceParams {
  qbCustomerId: string;
  tenantSlug: string;
  orderId: string;
  lines: StorefrontQbLine[];
  memo?: string;
  privateNote?: string;
}

/**
 * Create a QBO Invoice for a storefront order. Every line references
 * a QBO Item (per-product catalog entry, ensured/cached above) and
 * carries TaxCodeRef=NON so QBO does NOT add sales tax.
 * GlobalTaxCalculation=NotApplicable further suppresses AST
 * calculation on the whole invoice.
 */
export async function createStorefrontInvoice(
  params: CreateStorefrontInvoiceParams,
): Promise<{ Id: string; DocNumber: string; TotalAmt: number; SyncToken: string }> {
  const lineBodies = await Promise.all(
    params.lines.map(async (l, idx) => {
      const item = await ensureQbItemForProduct({
        productId: l.productId,
        name: l.productName,
        sku: l.sku,
        unitPrice: l.unitPrice,
      });
      return {
        LineNum: idx + 1,
        Amount: round2(l.unitPrice * l.quantity),
        DetailType: "SalesItemLineDetail",
        Description: l.description ?? l.productName,
        SalesItemLineDetail: {
          ItemRef: { value: item.Id, name: item.Name },
          UnitPrice: round2(l.unitPrice),
          Qty: l.quantity,
          TaxCodeRef: { value: TAX_CODE_NON },
        },
      };
    }),
  );

  const body: Record<string, unknown> = {
    CustomerRef: { value: params.qbCustomerId },
    Line: lineBodies,
    AllowOnlineCreditCardPayment: true,
    AllowOnlineACHPayment: true,
    GlobalTaxCalculation: "NotApplicable",
    CustomerMemo: params.memo ? { value: params.memo } : undefined,
    PrivateNote:
      params.privateNote ??
      `storefront:${params.tenantSlug} order:${params.orderId}`,
  };

  const res = await qbApi("/invoice", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) {
    throw new Error(`QB create storefront invoice failed: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    Invoice: { Id: string; DocNumber: string; TotalAmt: number; SyncToken: string };
  };
  return data.Invoice;
}

export interface CreateStorefrontSalesReceiptParams extends CreateStorefrontInvoiceParams {
  paymentMethodRefId?: string | null;
  paymentRefNum?: string | null;
  depositToAccountId?: string | null;
}

/**
 * A SalesReceipt bundles the sale + payment in one QBO entity, which
 * is the right shape for a "paid immediately with card" storefront
 * order (as opposed to Invoice + separate Payment).
 */
export async function createStorefrontSalesReceipt(
  params: CreateStorefrontSalesReceiptParams,
): Promise<{ Id: string; DocNumber: string; TotalAmt: number; SyncToken: string }> {
  const lineBodies = await Promise.all(
    params.lines.map(async (l, idx) => {
      const item = await ensureQbItemForProduct({
        productId: l.productId,
        name: l.productName,
        sku: l.sku,
        unitPrice: l.unitPrice,
      });
      return {
        LineNum: idx + 1,
        Amount: round2(l.unitPrice * l.quantity),
        DetailType: "SalesItemLineDetail",
        Description: l.description ?? l.productName,
        SalesItemLineDetail: {
          ItemRef: { value: item.Id, name: item.Name },
          UnitPrice: round2(l.unitPrice),
          Qty: l.quantity,
          TaxCodeRef: { value: TAX_CODE_NON },
        },
      };
    }),
  );

  const body: Record<string, unknown> = {
    CustomerRef: { value: params.qbCustomerId },
    Line: lineBodies,
    GlobalTaxCalculation: "NotApplicable",
    PaymentRefNum: params.paymentRefNum ?? undefined,
    PaymentMethodRef: params.paymentMethodRefId
      ? { value: params.paymentMethodRefId }
      : undefined,
    DepositToAccountRef: params.depositToAccountId
      ? { value: params.depositToAccountId }
      : undefined,
    CustomerMemo: params.memo ? { value: params.memo } : undefined,
    PrivateNote:
      params.privateNote ??
      `storefront:${params.tenantSlug} order:${params.orderId}`,
  };

  const res = await qbApi("/salesreceipt", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) {
    throw new Error(`QB create storefront sales receipt failed: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    SalesReceipt: { Id: string; DocNumber: string; TotalAmt: number; SyncToken: string };
  };
  return data.SalesReceipt;
}

// ─── Reconcile helper ─────────────────────────────────────────────

/**
 * Given a ResolvedCart, produce the array of StorefrontQbLine that
 * the invoice / sales receipt helpers accept. Encapsulates the
 * "tenant_price_per_unit is what the customer pays; base_price and
 * commission stay off the customer-facing document" rule.
 */
export function resolvedCartToQbLines(resolved: ResolvedCart, productMeta: Record<string, { name: string; sku: string }>): StorefrontQbLine[] {
  return resolved.lines.map((l) => ({
    productId: l.product_id,
    sku: productMeta[l.product_id]?.sku ?? l.product_sku,
    productName: productMeta[l.product_id]?.name ?? l.product_name,
    quantity: l.quantity,
    unitPrice: l.tenant_price_per_unit,
  }));
}
