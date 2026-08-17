/**
 * Dwolla REST client for placement provider payouts.
 *
 * Deliberately fetch()-based, no dwolla-v2 SDK dep. Endpoints used:
 *   POST /token                     — OAuth2 client_credentials (~1h)
 *   POST /customers                 — create receive-only customer
 *   POST /customers/{id}/funding-sources — attach Plaid-verified bank
 *   POST /transfers                 — send money
 *   GET  /transfers/{id}            — status readback (webhook fallback)
 *
 * Config via env:
 *   DWOLLA_KEY
 *   DWOLLA_SECRET
 *   DWOLLA_ENV                      ('sandbox' | 'production'; default sandbox)
 *   DWOLLA_MASTER_FUNDING_SOURCE_URL — VC's own funding source URL
 *                                     (from Dwolla dashboard). Money
 *                                     originates here on every transfer.
 */

const DWOLLA_HOSTS: Record<string, { api: string; auth: string }> = {
  sandbox: {
    api: "https://api-sandbox.dwolla.com",
    auth: "https://api-sandbox.dwolla.com/token",
  },
  production: {
    api: "https://api.dwolla.com",
    auth: "https://api.dwolla.com/token",
  },
};

function dwollaHosts() {
  const env = (process.env.DWOLLA_ENV || "sandbox").toLowerCase();
  return DWOLLA_HOSTS[env] || DWOLLA_HOSTS.sandbox;
}

let _tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 60_000) {
    return _tokenCache.token;
  }
  const key = process.env.DWOLLA_KEY;
  const secret = process.env.DWOLLA_SECRET;
  if (!key || !secret) {
    throw new Error("DWOLLA_KEY or DWOLLA_SECRET not configured");
  }
  const basic = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(dwollaHosts().auth, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: "grant_type=client_credentials",
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || `Dwolla token exchange failed (HTTP ${res.status})`);
  }
  const ttlMs = ((data.expires_in ?? 3600) - 60) * 1000;
  _tokenCache = { token: data.access_token, expiresAt: Date.now() + ttlMs };
  return data.access_token;
}

interface DwollaFetchOpts {
  method: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
  path?: string;
  absoluteUrl?: string;
}

async function dwollaFetch(opts: DwollaFetchOpts): Promise<{
  status: number;
  headers: Headers;
  body: Record<string, unknown> | null;
}> {
  const token = await getAccessToken();
  const url = opts.absoluteUrl ?? `${dwollaHosts().api}${opts.path}`;
  const res = await fetch(url, {
    method: opts.method,
    headers: {
      Accept: "application/vnd.dwolla.v1.hal+json",
      "Content-Type": "application/vnd.dwolla.v1.hal+json",
      Authorization: `Bearer ${token}`,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, headers: res.headers, body };
}

/**
 * Create a Receive-Only Customer for a placement provider.
 * Receive-Only avoids the full KYC form (SSN, DOB, address) that
 * Verified Customers require. Fine for our marketplace-payout use
 * case since PPs only ever RECEIVE funds. Dwolla caps receive-only
 * customers at $10k/week — good enough for our tiers ($400-$1200
 * per location). Above that, admin upgrades manually in Dwolla.
 *
 * Returns the customer's resource URL — that's what Dwolla expects
 * for subsequent calls, and it embeds the id at the end. We parse
 * the id out for storage.
 */
export interface CreateCustomerArgs {
  firstName: string;
  lastName: string;
  email: string;
  businessName?: string;
  correlationId?: string;   // our placement_partners.id — for reconciliation
  ipAddress?: string;
}

export interface CreateCustomerResult {
  customerId: string;
  customerUrl: string;
}

export async function createReceiveOnlyCustomer(
  args: CreateCustomerArgs,
): Promise<CreateCustomerResult> {
  const body: Record<string, unknown> = {
    firstName: args.firstName,
    lastName: args.lastName,
    email: args.email,
    type: "receive-only",
  };
  if (args.businessName) body.businessName = args.businessName;
  if (args.correlationId) body.correlationId = args.correlationId;
  if (args.ipAddress) body.ipAddress = args.ipAddress;

  const res = await dwollaFetch({ method: "POST", path: "/customers", body });

  // 201 Created — new customer, URL in Location header
  if (res.status === 201) {
    const url = res.headers.get("location") || res.headers.get("Location");
    if (!url) throw new Error("Dwolla /customers: missing Location header");
    return { customerId: url.split("/").pop() as string, customerUrl: url };
  }

  // 409 with `_embedded.errors` containing "DuplicateResource" —
  // customer with that email already exists. The error body
  // includes the existing resource URL under _links.about.href.
  if (res.status === 409 && res.body) {
    const linkAbout =
      (res.body as { _links?: { about?: { href?: string } } })._links?.about?.href;
    if (linkAbout) {
      return { customerId: linkAbout.split("/").pop() as string, customerUrl: linkAbout };
    }
  }

  throw new Error(dwollaError(res.status, res.body) || `Dwolla /customers failed (${res.status})`);
}

/**
 * Attach a Plaid-verified bank as a funding source to a Dwolla
 * customer. `plaidToken` is the processor_token from Plaid's
 * /processor/token/create with processor='dwolla'.
 */
export async function attachFundingSourceFromPlaid(args: {
  customerId: string;
  plaidToken: string;
  name?: string;
}): Promise<{ fundingSourceId: string; fundingSourceUrl: string }> {
  const res = await dwollaFetch({
    method: "POST",
    path: `/customers/${args.customerId}/funding-sources`,
    body: {
      plaidToken: args.plaidToken,
      name: args.name || "Bank account",
    },
  });
  if (res.status !== 201) {
    throw new Error(
      dwollaError(res.status, res.body) || `Dwolla funding-sources failed (${res.status})`,
    );
  }
  const url = res.headers.get("location") || res.headers.get("Location");
  if (!url) throw new Error("Dwolla funding-sources: missing Location header");
  return { fundingSourceId: url.split("/").pop() as string, fundingSourceUrl: url };
}

/**
 * Create a Dwolla transfer from our master funding source to a PP's
 * funding source. Returns the transfer id + resource URL. Money is
 * ACH — expect 1-3 business days to settle. Settlement fires the
 * customer_transfer_completed webhook.
 */
export async function createTransfer(args: {
  destinationFundingSourceUrl: string;
  amountCents: number;
  metadata?: Record<string, string>;
}): Promise<{ transferId: string; transferUrl: string }> {
  const masterUrl = process.env.DWOLLA_MASTER_FUNDING_SOURCE_URL;
  if (!masterUrl) {
    throw new Error("DWOLLA_MASTER_FUNDING_SOURCE_URL not configured");
  }
  if (!Number.isFinite(args.amountCents) || args.amountCents <= 0) {
    throw new Error("amountCents must be a positive integer");
  }
  const dollars = (args.amountCents / 100).toFixed(2);
  const body: Record<string, unknown> = {
    _links: {
      source: { href: masterUrl },
      destination: { href: args.destinationFundingSourceUrl },
    },
    amount: { currency: "USD", value: dollars },
  };
  if (args.metadata) body.metadata = args.metadata;

  const res = await dwollaFetch({ method: "POST", path: "/transfers", body });
  if (res.status !== 201) {
    throw new Error(
      dwollaError(res.status, res.body) || `Dwolla /transfers failed (${res.status})`,
    );
  }
  const url = res.headers.get("location") || res.headers.get("Location");
  if (!url) throw new Error("Dwolla /transfers: missing Location header");
  return { transferId: url.split("/").pop() as string, transferUrl: url };
}

export async function getTransfer(transferId: string): Promise<{
  id: string;
  status: string;
  amount?: { value: string; currency: string };
  raw: Record<string, unknown> | null;
}> {
  const res = await dwollaFetch({ method: "GET", path: `/transfers/${transferId}` });
  if (res.status !== 200 || !res.body) {
    throw new Error(dwollaError(res.status, res.body) || `Dwolla GET transfer ${transferId} failed`);
  }
  return {
    id: transferId,
    status: String(res.body.status || "unknown"),
    amount: res.body.amount as { value: string; currency: string } | undefined,
    raw: res.body,
  };
}

function dwollaError(status: number, body: Record<string, unknown> | null): string | null {
  if (!body) return null;
  if (typeof body.message === "string") return `HTTP ${status}: ${body.message}`;
  const embedded = body._embedded as { errors?: Array<{ message?: string; code?: string }> } | undefined;
  if (embedded?.errors?.length) {
    return embedded.errors.map((e) => e.message || e.code).join("; ");
  }
  return null;
}
