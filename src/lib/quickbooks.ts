import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createHmac } from "crypto";

const QB_SANDBOX_BASE = "https://sandbox-quickbooks.api.intuit.com";
const QB_PRODUCTION_BASE = "https://quickbooks.api.intuit.com";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";

function isProduction(): boolean {
  return process.env.QB_ENVIRONMENT === "production";
}

function getApiBase(): string {
  return isProduction() ? QB_PRODUCTION_BASE : QB_SANDBOX_BASE;
}

export function getOAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.QB_CLIENT_ID;
  if (!clientId) throw new Error("QB_CLIENT_ID not configured");
  const scopes = "com.intuit.quickbooks.accounting com.intuit.quickbooks.payment";
  return `${QB_AUTH_URL}?client_id=${clientId}&response_type=code&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("QB credentials not configured");

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QB token exchange failed: ${text}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    x_refresh_token_expires_in: number;
    token_type: string;
  }>;
}

async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("QB credentials not configured");

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QB token refresh failed: ${text}`);
  }

  return res.json();
}

export interface QBConnection {
  id: string;
  realm_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  company_name: string | null;
}

export async function getConnection(): Promise<QBConnection> {
  const { data, error } = await supabaseAdmin
    .from("quickbooks_connection")
    .select("*")
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error("QuickBooks not connected. Please connect via Admin > Settings.");
  }

  const now = new Date();
  const expiresAt = new Date(data.token_expires_at);

  // Refresh if token expires within 5 minutes
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    const tokens = await refreshAccessToken(data.refresh_token);
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabaseAdmin
      .from("quickbooks_connection")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    return { ...data, access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_expires_at: newExpiresAt };
  }

  return data;
}

async function qbFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const conn = await getConnection();
  const url = `${getApiBase()}/v3/company/${conn.realm_id}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  return res;
}

// ─── Customer Management ───

export interface QBCustomer {
  Id: string;
  DisplayName: string;
  PrimaryEmailAddr?: { Address: string };
  SyncToken: string;
}

export async function findCustomerByEmail(email: string): Promise<QBCustomer | null> {
  const query = `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${email.replace(/'/g, "\\'")}'`;
  const res = await qbFetch(`/query?query=${encodeURIComponent(query)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.QueryResponse?.Customer?.[0] || null;
}

export async function findCustomerByName(displayName: string): Promise<QBCustomer | null> {
  const query = `SELECT * FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`;
  const res = await qbFetch(`/query?query=${encodeURIComponent(query)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.QueryResponse?.Customer?.[0] || null;
}

export async function createCustomer(params: {
  displayName: string;
  email: string;
  phone?: string;
}): Promise<QBCustomer> {
  const body: Record<string, unknown> = {
    DisplayName: params.displayName,
    PrimaryEmailAddr: { Address: params.email },
  };
  if (params.phone) {
    body.PrimaryPhone = { FreeFormNumber: params.phone };
  }

  const res = await qbFetch("/customer", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();

    // Handle duplicate name — look up the existing customer and return it
    if (text.includes("6240") || text.includes("Duplicate Name")) {
      const existing = await findCustomerByName(params.displayName);
      if (existing) return existing;
    }

    throw new Error(`QB create customer failed: ${text}`);
  }

  const data = await res.json();
  return data.Customer;
}

export async function findOrCreateCustomer(params: {
  displayName: string;
  email: string;
  phone?: string;
}): Promise<QBCustomer> {
  // Try email first
  const byEmail = await findCustomerByEmail(params.email);
  if (byEmail) return byEmail;

  // Try display name (QB enforces unique names)
  const byName = await findCustomerByName(params.displayName);
  if (byName) return byName;

  return createCustomer(params);
}

// ─── Invoice Management ───

export interface QBInvoice {
  Id: string;
  DocNumber: string;
  TotalAmt: number;
  Balance: number;
  InvoiceLink?: string;
  SyncToken: string;
  MetaData: { CreateTime: string; LastUpdatedTime: string };
}

export interface CreateInvoiceParams {
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  lineItems: {
    description: string;
    amount: number; // in dollars
    quantity?: number;
  }[];
  memo?: string;
  dueDate?: string;
  metadata?: Record<string, string>;
}

export async function createInvoice(params: CreateInvoiceParams): Promise<QBInvoice> {
  const customer = await findOrCreateCustomer({
    displayName: params.customerName,
    email: params.customerEmail,
    phone: params.customerPhone,
  });

  const lines = params.lineItems.map((item, idx) => ({
    LineNum: idx + 1,
    Amount: item.amount * (item.quantity || 1),
    DetailType: "SalesItemLineDetail",
    Description: item.description,
    SalesItemLineDetail: {
      UnitPrice: item.amount,
      Qty: item.quantity || 1,
    },
  }));

  const invoiceBody: Record<string, unknown> = {
    CustomerRef: { value: customer.Id },
    Line: lines,
    AllowOnlineCreditCardPayment: true,
    AllowOnlineACHPayment: true,
    DueDate: params.dueDate || new Date().toISOString().split("T")[0],
    CustomerMemo: params.memo ? { value: params.memo } : undefined,
    PrivateNote: params.metadata ? JSON.stringify(params.metadata) : undefined,
  };

  const res = await qbFetch("/invoice", {
    method: "POST",
    body: JSON.stringify(invoiceBody),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QB create invoice failed: ${text}`);
  }

  const data = await res.json();
  return data.Invoice;
}

export async function sendInvoiceEmail(invoiceId: string, email?: string): Promise<void> {
  const query = email ? `?sendTo=${encodeURIComponent(email)}` : "";
  const res = await qbFetch(`/invoice/${invoiceId}/send${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QB send invoice email failed: ${text}`);
  }
}

export async function getInvoice(invoiceId: string): Promise<QBInvoice> {
  const res = await qbFetch(`/invoice/${invoiceId}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QB get invoice failed: ${text}`);
  }
  const data = await res.json();
  return data.Invoice;
}

export async function voidInvoice(invoiceId: string): Promise<void> {
  const invoice = await getInvoice(invoiceId);
  const res = await qbFetch(`/invoice?operation=void`, {
    method: "POST",
    body: JSON.stringify({
      Id: invoice.Id,
      SyncToken: invoice.SyncToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QB void invoice failed: ${text}`);
  }
}

// ─── Payment Queries ───

export interface QBPayment {
  Id: string;
  TotalAmt: number;
  TxnDate: string;
  PaymentRefNum: string;
  Line: { LinkedTxn: { TxnId: string; TxnType: string }[] }[];
}

export async function getPaymentsForInvoice(invoiceId: string): Promise<QBPayment[]> {
  const query = `SELECT * FROM Payment WHERE Line.LinkedTxn.TxnId = '${invoiceId}' AND Line.LinkedTxn.TxnType = 'Invoice'`;
  const res = await qbFetch(`/query?query=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.QueryResponse?.Payment || [];
}

// ─── Direct Charge (Payments API v4) ───

export interface QBCharge {
  id: string;
  status: string;
  amount: number;
  created: string;
  authCode: string;
}

export async function createCharge(params: {
  amountCents: number;
  currency?: string;
  cardToken: string;
  description?: string;
}): Promise<QBCharge> {
  const conn = await getConnection();
  const base = isProduction()
    ? "https://api.intuit.com"
    : "https://sandbox.api.intuit.com";

  const res = await fetch(`${base}/quickbooks/v4/payments/charges`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
      "Request-Id": crypto.randomUUID(),
    },
    body: JSON.stringify({
      amount: (params.amountCents / 100).toFixed(2),
      currency: params.currency || "USD",
      token: params.cardToken,
      description: params.description,
      context: {
        mobile: false,
        isEcommerce: true,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QB charge failed: ${text}`);
  }

  return res.json();
}

// ─── Webhook Verification ───

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const webhookVerifierToken = process.env.QB_WEBHOOK_VERIFIER_TOKEN;
  if (!webhookVerifierToken) return false;

  try {
    const hash = createHmac("sha256", webhookVerifierToken)
      .update(payload)
      .digest("base64");
    return hash === signature;
  } catch {
    return false;
  }
}

