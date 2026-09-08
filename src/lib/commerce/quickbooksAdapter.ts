import { isQbProduction, qbApi } from "@/lib/quickbooks";

/**
 * Vinnie's isolated QuickBooks adapter.
 *
 * This is the only module in src/lib/commerce that talks to QuickBooks,
 * and it is reachable only from Vinnie's checkout, status reconciliation,
 * and the administrator mapping interface. It shares nothing with the
 * existing customer payment routes except the low-level authenticated
 * fetch (`qbApi`) and the environment reader (`isQbProduction`), both of
 * which are unchanged from main.
 *
 * Production only. Every entry point calls `assertVinnieQuickBooksAllowed`
 * BEFORE any client is constructed or any request is built:
 *   VERCEL_ENV must equal "production" (development, preview, test, and a
 *   missing value all fail closed), and the existing QuickBooks
 *   environment guard must report production. No sandbox exists and none
 *   is used.
 *
 * Variables read (names only): VERCEL_ENV here; QB_ENVIRONMENT through the
 * existing `isQbProduction` helper. Tokens come from the existing
 * `quickbooks_connection` row through the existing `qbApi` plumbing.
 */
export const VINNIE_QBO_ENV_VARS = ["VERCEL_ENV", "QB_ENVIRONMENT"] as const;

export class VinnieQuickBooksUnavailableError extends Error {
  readonly code = "qbo_unavailable";
  constructor(reason: string) {
    super(reason);
    this.name = "VinnieQuickBooksUnavailableError";
  }
}

export interface EnvGate {
  allowed: boolean;
  reason: string | null;
}

export function vinnieQuickBooksGate(env: Record<string, string | undefined> = process.env, productionGuard: () => boolean = isQbProduction): EnvGate {
  if (env.VERCEL_ENV !== "production") return { allowed: false, reason: "Checkout is only available on the production site." };
  if (!productionGuard()) return { allowed: false, reason: "QuickBooks is not configured for production on this deployment." };
  return { allowed: true, reason: null };
}

export function assertVinnieQuickBooksAllowed(env: Record<string, string | undefined> = process.env, productionGuard: () => boolean = isQbProduction): void {
  const gate = vinnieQuickBooksGate(env, productionGuard);
  if (!gate.allowed) throw new VinnieQuickBooksUnavailableError(gate.reason ?? "QuickBooks is unavailable.");
}

// ─── Hosted payment link validation ────────────────────────────────────

const TRUSTED_HOSTS = ["intuit.com", "quickbooks.com"] as const;
const HOST_CHARS = /^[a-z0-9.-]+$/;
const CONTROL_OR_SPACE = /[\s\x00-\x1f\x7f]/;
const ABSOLUTE_HTTPS = /^https:\/\/[^/]/i;

/**
 * Accepts only an absolute https URL, without embedded credentials, whose
 * host is exactly a trusted Intuit/QuickBooks domain or a dot-boundary
 * subdomain of one. Everything else (http, protocol-relative, javascript:,
 * data:, look-alike hosts, userinfo tricks, malformed input) is null.
 */
function parseHttpsUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 2048 || CONTROL_OR_SPACE.test(trimmed) || !ABSOLUTE_HTTPS.test(trimmed)) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

function isTrustedHost(host: string): boolean {
  if (!HOST_CHARS.test(host) || host.startsWith(".") || host.includes("..")) return false;
  return TRUSTED_HOSTS.some((t) => host === t || host.endsWith(`.${t}`));
}

export function validateHostedInvoiceLink(raw: unknown): string | null {
  const url = parseHttpsUrl(raw);
  if (!url || url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
  return isTrustedHost(url.hostname.toLowerCase()) ? url.href : null;
}

// ─── Types ─────────────────────────────────────────────────────────────

export interface VinnieCustomer {
  Id: string;
  DisplayName: string;
}

export interface VinnieInvoice {
  Id: string;
  DocNumber: string | null;
  TotalAmt: number;
  Balance: number;
}

export interface VinnieInvoiceLine {
  description: string;
  unitPrice: number;
  quantity: number;
  /** Existing QuickBooks Item id. Required: Vinnie never sends free-text lines. */
  qbItemId: string;
}

export interface VinnieBillAddr {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface CreateVinnieInvoiceParams {
  customerId: string;
  customerEmail: string;
  billAddr: VinnieBillAddr;
  lines: VinnieInvoiceLine[];
  /** Deterministic per quote version; duplicates resolve to the existing invoice. */
  docNumber: string;
  memo: string;
  privateNote: Record<string, string>;
}

/** Safe subset of a QuickBooks Item for the administrator mapping screen. */
export interface QuickBooksItemSummary {
  id: string;
  name: string;
  sku: string | null;
  active: boolean;
  type: string | null;
  taxable: boolean | null;
  sales_tax_code: string | null;
}

export type VinnieFetch = (path: string, options?: RequestInit) => Promise<Response>;

export interface VinnieQuickBooks {
  findOrCreateCustomer(params: { displayName: string; email: string; phone?: string }): Promise<VinnieCustomer>;
  createInvoice(params: CreateVinnieInvoiceParams): Promise<VinnieInvoice>;
  sendInvoiceEmail(invoiceId: string, email: string): Promise<void>;
  getHostedInvoiceLink(invoiceId: string): Promise<string | null>;
  getInvoiceStatus(invoiceId: string): Promise<VinnieInvoice>;
  /** Read-only. Never creates, updates, or deactivates an Item. */
  listItems(): Promise<QuickBooksItemSummary[]>;
}

// ─── Implementation ────────────────────────────────────────────────────

/** QuickBooks query-language string literal escaping: backslashes first, then single quotes. */
export const escapeQuery = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const round2 = (n: number) => Math.round(n * 100) / 100;

async function failText(res: Response, what: string): Promise<never> {
  const text = await res.text().catch(() => "");
  throw new Error(`QuickBooks ${what} failed (${res.status}): ${text.slice(0, 500)}`);
}

function toInvoice(raw: Record<string, unknown>): VinnieInvoice {
  return { Id: String(raw.Id), DocNumber: typeof raw.DocNumber === "string" ? raw.DocNumber : null, TotalAmt: Number(raw.TotalAmt ?? 0), Balance: Number(raw.Balance ?? 0) };
}

function toItemSummary(raw: Record<string, unknown>): QuickBooksItemSummary {
  const taxCode = raw.SalesTaxCodeRef as { value?: unknown } | undefined;
  return {
    id: String(raw.Id),
    name: typeof raw.Name === "string" ? raw.Name : "",
    sku: typeof raw.Sku === "string" && raw.Sku.length > 0 ? raw.Sku : null,
    active: raw.Active !== false,
    type: typeof raw.Type === "string" ? raw.Type : null,
    taxable: typeof raw.Taxable === "boolean" ? raw.Taxable : null,
    sales_tax_code: typeof taxCode?.value === "string" ? taxCode.value : null,
  };
}

function invoiceBody(p: CreateVinnieInvoiceParams): Record<string, unknown> {
  return {
    CustomerRef: { value: p.customerId },
    DocNumber: p.docNumber,
    Line: p.lines.map((l, idx) => ({
      LineNum: idx + 1,
      Amount: round2(l.unitPrice * l.quantity),
      DetailType: "SalesItemLineDetail",
      Description: l.description,
      SalesItemLineDetail: { ItemRef: { value: l.qbItemId }, UnitPrice: l.unitPrice, Qty: l.quantity },
    })),
    BillAddr: { Line1: p.billAddr.line1, City: p.billAddr.city, CountrySubDivisionCode: p.billAddr.state, PostalCode: p.billAddr.postalCode },
    BillEmail: { Address: p.customerEmail },
    AllowOnlineCreditCardPayment: true,
    AllowOnlineACHPayment: true,
    DueDate: new Date().toISOString().split("T")[0],
    CustomerMemo: { value: p.memo },
    PrivateNote: JSON.stringify(p.privateNote),
  };
}

const isDuplicate = (text: string, code: string, phrase: string) => text.includes(code) || text.toLowerCase().includes(phrase);

class ProductionVinnieQuickBooks implements VinnieQuickBooks {
  constructor(
    private readonly api: VinnieFetch,
    private readonly env: Record<string, string | undefined>,
    private readonly guard: () => boolean,
  ) {}

  private async call(path: string, options?: RequestInit): Promise<Response> {
    assertVinnieQuickBooksAllowed(this.env, this.guard);
    return this.api(path, options);
  }

  private async query<T>(sql: string, entity: string): Promise<T[]> {
    const res = await this.call(`/query?query=${encodeURIComponent(sql)}`);
    if (!res.ok) return failText(res, "query");
    const data = (await res.json()) as { QueryResponse?: Record<string, T[]> };
    return data.QueryResponse?.[entity] ?? [];
  }

  private async findCustomer(email: string, displayName: string): Promise<VinnieCustomer | null> {
    const byEmail = await this.query<VinnieCustomer>(`SELECT Id, DisplayName FROM Customer WHERE PrimaryEmailAddr = '${escapeQuery(email)}'`, "Customer");
    if (byEmail[0]) return byEmail[0];
    const byName = await this.query<VinnieCustomer>(`SELECT Id, DisplayName FROM Customer WHERE DisplayName = '${escapeQuery(displayName)}'`, "Customer");
    return byName[0] ?? null;
  }

  async findOrCreateCustomer(params: { displayName: string; email: string; phone?: string }): Promise<VinnieCustomer> {
    const existing = await this.findCustomer(params.email, params.displayName);
    if (existing) return existing;
    const body: Record<string, unknown> = { DisplayName: params.displayName, PrimaryEmailAddr: { Address: params.email } };
    if (params.phone) body.PrimaryPhone = { FreeFormNumber: params.phone };
    const res = await this.call("/customer", { method: "POST", body: JSON.stringify(body) });
    if (res.ok) return ((await res.json()) as { Customer: VinnieCustomer }).Customer;
    const text = await res.text().catch(() => "");
    const again = isDuplicate(text, "6240", "duplicate name") ? await this.findCustomer(params.email, params.displayName) : null;
    if (again) return again;
    throw new Error(`QuickBooks create customer failed (${res.status}): ${text.slice(0, 500)}`);
  }

  private async findInvoiceByDocNumber(docNumber: string): Promise<VinnieInvoice | null> {
    const rows = await this.query<Record<string, unknown>>(`SELECT * FROM Invoice WHERE DocNumber = '${escapeQuery(docNumber)}'`, "Invoice");
    return rows[0] ? toInvoice(rows[0]) : null;
  }

  async createInvoice(params: CreateVinnieInvoiceParams): Promise<VinnieInvoice> {
    if (params.lines.length === 0) throw new Error("Vinnie invoices require at least one mapped line.");
    if (params.lines.some((l) => !l.qbItemId)) throw new Error("Vinnie invoices require a QuickBooks Item reference on every line.");
    const existing = await this.findInvoiceByDocNumber(params.docNumber);
    if (existing) return existing;
    const res = await this.call("/invoice", { method: "POST", body: JSON.stringify(invoiceBody(params)) });
    if (res.ok) return toInvoice(((await res.json()) as { Invoice: Record<string, unknown> }).Invoice);
    const text = await res.text().catch(() => "");
    const again = isDuplicate(text, "6140", "duplicate document number") ? await this.findInvoiceByDocNumber(params.docNumber) : null;
    if (again) return again;
    throw new Error(`QuickBooks create invoice failed (${res.status}): ${text.slice(0, 500)}`);
  }

  async sendInvoiceEmail(invoiceId: string, email: string): Promise<void> {
    const res = await this.call(`/invoice/${encodeURIComponent(invoiceId)}/send?sendTo=${encodeURIComponent(email)}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" } });
    if (!res.ok) return failText(res, "send invoice");
  }

  async getHostedInvoiceLink(invoiceId: string): Promise<string | null> {
    const res = await this.call(`/invoice/${encodeURIComponent(invoiceId)}?include=invoiceLink`);
    if (!res.ok) return failText(res, "get invoice link");
    const data = (await res.json()) as { Invoice?: { InvoiceLink?: unknown } };
    return validateHostedInvoiceLink(data.Invoice?.InvoiceLink);
  }

  async getInvoiceStatus(invoiceId: string): Promise<VinnieInvoice> {
    const res = await this.call(`/invoice/${encodeURIComponent(invoiceId)}`);
    if (!res.ok) return failText(res, "get invoice");
    const data = (await res.json()) as { Invoice: Record<string, unknown> };
    return toInvoice(data.Invoice);
  }

  async listItems(): Promise<QuickBooksItemSummary[]> {
    const out: QuickBooksItemSummary[] = [];
    const page = 1000;
    for (let start = 1; start <= 10_000; start += page) {
      const rows = await this.query<Record<string, unknown>>(`SELECT * FROM Item WHERE Active IN (true, false) STARTPOSITION ${start} MAXRESULTS ${page}`, "Item");
      out.push(...rows.map(toItemSummary));
      if (rows.length < page) break;
    }
    return out;
  }
}

/**
 * Construct the adapter. Throws before anything else happens unless the
 * deployment is Production. `api` is injectable for tests only; the
 * default is the existing authenticated QuickBooks fetch.
 */
export function createVinnieQuickBooks(
  env: Record<string, string | undefined> = process.env,
  api: VinnieFetch = qbApi,
  productionGuard: () => boolean = isQbProduction,
): VinnieQuickBooks {
  assertVinnieQuickBooksAllowed(env, productionGuard);
  return new ProductionVinnieQuickBooks(api, env, productionGuard);
}
