/**
 * Plaid REST client for the Dwolla-payouts onboarding flow.
 *
 * Deliberately no @plaid/sdk dependency — we only need three
 * endpoints (link_token/create, item/public_token/exchange,
 * processor/token/create) and the shape is stable. Keeps the
 * dependency surface small.
 *
 * Config via env:
 *   PLAID_CLIENT_ID
 *   PLAID_SECRET
 *   PLAID_ENV  ('sandbox' | 'development' | 'production'; default sandbox)
 */

const PLAID_HOSTS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

function plaidBase(): string {
  const env = (process.env.PLAID_ENV || "sandbox").toLowerCase();
  return PLAID_HOSTS[env] || PLAID_HOSTS.sandbox;
}

interface PlaidCommon {
  client_id: string;
  secret: string;
}

function plaidCreds(): PlaidCommon {
  const client_id = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!client_id || !secret) {
    throw new Error("PLAID_CLIENT_ID or PLAID_SECRET not configured");
  }
  return { client_id, secret };
}

async function plaidPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${plaidBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...plaidCreds(), ...body }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      (typeof data.error_message === "string" && data.error_message) ||
      (typeof data.display_message === "string" && data.display_message) ||
      `Plaid ${path} failed (HTTP ${res.status})`;
    throw new Error(String(message));
  }
  return data as T;
}

export interface LinkTokenResponse {
  link_token: string;
  expiration: string;
  request_id: string;
}

/**
 * Create a Plaid Link token scoped to a single user. The Link token
 * is passed to the Plaid Link Web SDK on the frontend. We request
 * only the `auth` product (bank account routing/account numbers) —
 * that's all Dwolla's IAV needs.
 */
export async function createLinkToken(args: {
  clientUserId: string;
  clientName?: string;
  userLegalName?: string;
  userEmail?: string;
}): Promise<LinkTokenResponse> {
  return plaidPost<LinkTokenResponse>("/link/token/create", {
    user: {
      client_user_id: args.clientUserId,
      legal_name: args.userLegalName,
      email_address: args.userEmail,
    },
    client_name: args.clientName || "Vending Connector — Placement Payouts",
    products: ["auth"],
    country_codes: ["US"],
    language: "en",
    webhook: process.env.PLAID_WEBHOOK_URL || undefined,
  });
}

export interface ExchangeResponse {
  access_token: string;
  item_id: string;
  request_id: string;
}

export async function exchangePublicToken(publicToken: string): Promise<ExchangeResponse> {
  return plaidPost<ExchangeResponse>("/item/public_token/exchange", {
    public_token: publicToken,
  });
}

export interface ProcessorTokenResponse {
  processor_token: string;
  request_id: string;
}

/**
 * Create a Dwolla-flavored processor token from a Plaid access token
 * + account id. The processor token is what Dwolla accepts to create
 * a verified funding source without us ever touching the account /
 * routing numbers.
 */
export async function createDwollaProcessorToken(args: {
  accessToken: string;
  accountId: string;
}): Promise<ProcessorTokenResponse> {
  return plaidPost<ProcessorTokenResponse>("/processor/token/create", {
    access_token: args.accessToken,
    account_id: args.accountId,
    processor: "dwolla",
  });
}
