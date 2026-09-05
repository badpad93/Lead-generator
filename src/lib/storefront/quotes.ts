/**
 * Storefront quote domain logic (tenant-scoped).
 *
 * Security model (mirrors the other storefront_* libs): all access is via
 * supabaseAdmin behind authenticated server routes. Operator scope is
 * derived from the AUTHENTICATED owner's tenant — never from a client
 * tenant_id — so Tenant A can't touch Tenant B. Every referenced customer
 * is verified to belong to the operator's tenant.
 *
 * Pricing reuses quotePricing (same tables as the storefront), so a quoted
 * price equals the price the customer later sees. Line prices are
 * SNAPSHOTTED on send: later tier-table edits never change a sent quote.
 */
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveTenantTierPrices,
  computeQuoteLine,
  computeQuoteTotals,
  type QuoteLineComputed,
} from "@/lib/storefront/quotePricing";

export type QuoteStatus = "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";

export class QuoteError extends Error {
  code: "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "BAD_STATUS";
  constructor(code: QuoteError["code"], message: string) {
    super(message);
    this.name = "QuoteError";
    this.code = code;
  }
}

export interface QuoteLineDraft {
  product_id: string;
  quantity: number;
  override_unit_price?: number | null;
}

export interface CreateQuoteInput {
  tenantId: string;
  createdBy: string;
  customerProfileId?: string | null;
  prospect?: {
    email?: string | null;
    company?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
  } | null;
  notes?: string | null;
  selectedTier: number;
  lines: QuoteLineDraft[];
}

function tierName(tenant: { price_tier_names?: Record<string, unknown> | null }, tier: number): string {
  const names = (tenant.price_tier_names ?? {}) as Record<string, unknown>;
  return (names[String(tier)] as string) || `Tier ${tier}`;
}

function normalizeTier(t: unknown): number {
  const n = Math.floor(Number(t));
  if (![1, 2, 3].includes(n)) throw new QuoteError("INVALID", "selectedTier must be 1, 2 or 3");
  return n;
}

/** Compute snapshot line rows + header totals for a tenant/tier/lines set. */
async function buildLines(
  tenantId: string,
  tier: number,
  drafts: QuoteLineDraft[],
): Promise<{ rows: Array<Record<string, unknown>>; computed: QuoteLineComputed[]; productMeta: Map<string, { name: string; sku: string | null }> }> {
  const wanted = drafts
    .map((d) => ({ product_id: String(d.product_id), quantity: Number(d.quantity), override: d.override_unit_price }))
    .filter((d) => d.product_id && Number.isFinite(d.quantity) && d.quantity > 0);
  const priceMap = await resolveTenantTierPrices(tenantId, tier, wanted.map((w) => w.product_id));

  const rows: Array<Record<string, unknown>> = [];
  const computed: QuoteLineComputed[] = [];
  const productMeta = new Map<string, { name: string; sku: string | null }>();
  for (const w of wanted) {
    const info = priceMap.get(w.product_id);
    if (!info) continue; // product not in this tenant's catalog resolution — skip
    const line = computeQuoteLine({
      tierUnitPrice: info.tierUnitPrice,
      overrideUnitPrice: w.override,
      quantity: w.quantity,
      unitCost: info.unitCost,
    });
    computed.push(line);
    productMeta.set(w.product_id, { name: info.name, sku: info.sku });
    rows.push({
      product_id: w.product_id,
      product_name: info.name,
      product_sku: info.sku,
      quantity: line.quantity,
      tier_unit_price: line.tierUnitPrice,
      quoted_unit_price: line.unitPrice,
      is_override: line.isOverride,
      line_total: line.lineTotal,
      unit_cost: line.unitCost,
    });
  }
  return { rows, computed, productMeta };
}

/** Verify a customer profile is enrolled with this tenant (else foreign). */
async function assertCustomerBelongs(tenantId: string, customerProfileId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, storefront_tenant_id")
    .eq("id", customerProfileId)
    .maybeSingle();
  const prof = data as { storefront_tenant_id: string | null } | null;
  if (!prof || prof.storefront_tenant_id !== tenantId) {
    throw new QuoteError("FORBIDDEN", "Customer does not belong to this storefront");
  }
}

async function loadTenant(tenantId: string): Promise<{ id: string; price_tier_names: Record<string, unknown> | null }> {
  const { data } = await supabaseAdmin
    .from("storefront_tenants")
    .select("id, price_tier_names")
    .eq("id", tenantId)
    .maybeSingle();
  const t = data as { id: string; price_tier_names: Record<string, unknown> | null } | null;
  if (!t) throw new QuoteError("NOT_FOUND", "Tenant not found");
  return t;
}

function prospectColumns(p: CreateQuoteInput["prospect"]): Record<string, string | null> {
  return {
    prospect_email: p?.email ?? null,
    prospect_company: p?.company ?? null,
    prospect_first_name: p?.first_name ?? null,
    prospect_last_name: p?.last_name ?? null,
    prospect_phone: p?.phone ?? null,
  };
}

export async function createQuote(input: CreateQuoteInput) {
  const tier = normalizeTier(input.selectedTier);
  const tenant = await loadTenant(input.tenantId);
  if (input.customerProfileId) await assertCustomerBelongs(input.tenantId, input.customerProfileId);
  if (!input.customerProfileId && !input.prospect?.email) {
    throw new QuoteError("INVALID", "A customer or a prospect email is required");
  }

  const { rows, computed } = await buildLines(input.tenantId, tier, input.lines);
  const totals = computeQuoteTotals(computed);

  const { data: quote, error } = await supabaseAdmin
    .from("storefront_quotes")
    .insert({
      storefront_tenant_id: input.tenantId,
      created_by: input.createdBy,
      customer_profile_id: input.customerProfileId ?? null,
      ...prospectColumns(input.prospect),
      notes: input.notes ?? null,
      selected_tier: tier,
      selected_tier_name: tierName(tenant, tier),
      status: "draft",
      subtotal: totals.subtotal,
      total: totals.total,
      est_cost: totals.estCost,
      est_gross_profit: totals.estGrossProfit,
    })
    .select("*")
    .single();
  if (error) throw error;
  const quoteId = (quote as { id: string }).id;
  if (rows.length > 0) {
    const { error: lineErr } = await supabaseAdmin
      .from("storefront_quote_lines")
      .insert(rows.map((r) => ({ ...r, quote_id: quoteId })));
    if (lineErr) throw lineErr;
  }
  return getQuote(input.tenantId, quoteId);
}

export async function getQuote(tenantId: string, quoteId: string) {
  const { data } = await supabaseAdmin
    .from("storefront_quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("storefront_tenant_id", tenantId)
    .maybeSingle();
  if (!data) throw new QuoteError("NOT_FOUND", "Quote not found");
  const { data: lines } = await supabaseAdmin
    .from("storefront_quote_lines")
    .select("*")
    .eq("quote_id", quoteId);
  return { quote: data, lines: (lines ?? []) as Array<Record<string, unknown>> };
}

export async function listQuotes(tenantId: string) {
  const { data } = await supabaseAdmin
    .from("storefront_quotes")
    .select("id, customer_profile_id, prospect_email, prospect_company, selected_tier, selected_tier_name, status, total, created_at, sent_at")
    .eq("storefront_tenant_id", tenantId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Array<Record<string, unknown>>;
}

/** Existing lines mapped back to drafts (preserving one-time overrides). */
function linesToDrafts(lines: Array<Record<string, unknown>>): QuoteLineDraft[] {
  return lines.map((l) => ({
    product_id: String(l.product_id),
    quantity: Number(l.quantity),
    override_unit_price: l.is_override ? Number(l.quoted_unit_price) : null,
  }));
}

/** Freeze a set of drafts as this quote's lines + header totals at `tier`. */
async function repriceQuote(args: {
  tenantId: string;
  quoteId: string;
  tier: number;
  tierNameStr: string;
  drafts: QuoteLineDraft[];
  extra?: Record<string, unknown>;
}): Promise<void> {
  const { tenantId, quoteId, tier, tierNameStr, drafts, extra = {} } = args;
  const { rows, computed } = await buildLines(tenantId, tier, drafts);
  const totals = computeQuoteTotals(computed);
  await supabaseAdmin.from("storefront_quote_lines").delete().eq("quote_id", quoteId);
  if (rows.length > 0) {
    await supabaseAdmin.from("storefront_quote_lines").insert(rows.map((r) => ({ ...r, quote_id: quoteId })));
  }
  await supabaseAdmin
    .from("storefront_quotes")
    .update({
      selected_tier: tier,
      selected_tier_name: tierNameStr,
      subtotal: totals.subtotal,
      total: totals.total,
      est_cost: totals.estCost,
      est_gross_profit: totals.estGrossProfit,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq("id", quoteId)
    .eq("storefront_tenant_id", tenantId);
}

export async function updateDraftQuote(
  tenantId: string,
  quoteId: string,
  patch: { selectedTier?: number; lines?: QuoteLineDraft[]; notes?: string | null },
) {
  const existing = await getQuote(tenantId, quoteId);
  if ((existing.quote as { status: string }).status !== "draft") {
    throw new QuoteError("BAD_STATUS", "Only draft quotes can be edited");
  }
  const tenant = await loadTenant(tenantId);
  const tier = patch.selectedTier != null ? normalizeTier(patch.selectedTier) : (existing.quote as { selected_tier: number }).selected_tier;
  const drafts = patch.lines ?? linesToDrafts(existing.lines);
  const notes = patch.notes !== undefined ? patch.notes : (existing.quote as { notes: string | null }).notes;
  await repriceQuote({ tenantId, quoteId, tier, tierNameStr: tierName(tenant, tier), drafts, extra: { notes } });
  return getQuote(tenantId, quoteId);
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Send a quote: re-resolve + snapshot prices at the current tier, mint a
 * public token (store only its hash), flip to sent, and — for an EXISTING
 * customer — assign the selected tier immediately. Prospect tier is held on
 * the quote until enrollment (assignTierFromQuoteOnEnroll).
 */
export async function sendQuote(tenantId: string, quoteId: string) {
  const existing = await getQuote(tenantId, quoteId);
  const q = existing.quote as {
    id: string;
    status: string;
    selected_tier: number;
    customer_profile_id: string | null;
  };
  if (!["draft", "sent", "viewed"].includes(q.status)) {
    throw new QuoteError("BAD_STATUS", `Cannot send a ${q.status} quote`);
  }
  const tenant = await loadTenant(tenantId);
  const tier = normalizeTier(q.selected_tier);

  // Re-price the CURRENT lines at the current tier and FREEZE them, minting
  // a public token (hash stored) and flipping to sent — one snapshot point.
  const rawToken = randomBytes(24).toString("hex");
  await repriceQuote({
    tenantId,
    quoteId,
    tier,
    tierNameStr: tierName(tenant, tier),
    drafts: linesToDrafts(existing.lines),
    extra: { status: "sent", public_token_hash: hashToken(rawToken), sent_at: new Date().toISOString() },
  });

  // Existing customer: assign the selected tier now.
  if (q.customer_profile_id) {
    await assignCustomerTier(tenantId, q.customer_profile_id, tier);
  }

  const fresh = await getQuote(tenantId, quoteId);
  return { ...fresh, rawToken };
}

/** Upsert a customer's storefront tier (the authoritative relationship). */
export async function assignCustomerTier(tenantId: string, customerProfileId: string, tier: number): Promise<void> {
  await supabaseAdmin
    .from("storefront_customer_tiers")
    .upsert(
      { tenant_id: tenantId, customer_profile_id: customerProfileId, tier, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id,customer_profile_id" },
    );
}

/** Customer-safe view resolved by raw public token; marks viewed. Never returns cost/margin. */
export async function getPublicQuoteByToken(rawToken: string) {
  const { data } = await supabaseAdmin
    .from("storefront_quotes")
    .select("id, storefront_tenant_id, customer_profile_id, prospect_email, prospect_company, prospect_first_name, selected_tier_name, status, subtotal, tax, shipping, total, sent_at, accepted_at, expires_at")
    .eq("public_token_hash", hashToken(rawToken))
    .maybeSingle();
  if (!data) throw new QuoteError("NOT_FOUND", "Quote not found");
  const q = data as Record<string, unknown>;
  if (q.status === "sent") {
    await supabaseAdmin
      .from("storefront_quotes")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", q.id as string)
      .eq("status", "sent");
    q.status = "viewed";
  }
  const { data: lines } = await supabaseAdmin
    .from("storefront_quote_lines")
    .select("product_name, product_sku, quantity, quoted_unit_price, line_total")
    .eq("quote_id", q.id as string);
  return { quote: q, lines: (lines ?? []) as Array<Record<string, unknown>> };
}

/**
 * Accept a quote by token. If a profile is provided, ensure the quoted
 * tier is assigned (existing customer, or a freshly-enrolled prospect).
 */
export async function acceptQuoteByToken(rawToken: string, profileId?: string | null) {
  const { data } = await supabaseAdmin
    .from("storefront_quotes")
    .select("id, storefront_tenant_id, customer_profile_id, selected_tier, status")
    .eq("public_token_hash", hashToken(rawToken))
    .maybeSingle();
  if (!data) throw new QuoteError("NOT_FOUND", "Quote not found");
  const q = data as { id: string; storefront_tenant_id: string; customer_profile_id: string | null; selected_tier: number; status: string };
  const linkedProfile = profileId ?? q.customer_profile_id;
  if (linkedProfile) {
    // Only assign when the profile is enrolled with this tenant (prospect
    // enrollment sets storefront_tenant_id first).
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("storefront_tenant_id")
      .eq("id", linkedProfile)
      .maybeSingle();
    if ((prof as { storefront_tenant_id: string | null } | null)?.storefront_tenant_id === q.storefront_tenant_id) {
      await assignCustomerTier(q.storefront_tenant_id, linkedProfile, normalizeTier(q.selected_tier));
    }
  }
  await supabaseAdmin
    .from("storefront_quotes")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      customer_profile_id: q.customer_profile_id ?? profileId ?? null,
    })
    .eq("id", q.id);
  return { tenantId: q.storefront_tenant_id };
}

/**
 * Called after a prospect enrolls through a quote: assign the quoted tier
 * to the now-enrolled customer. Deterministic (token-carried), tenant-safe.
 */
export async function assignTierFromQuoteOnEnroll(rawToken: string, profileId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("storefront_quotes")
    .select("id, storefront_tenant_id, selected_tier, status")
    .eq("public_token_hash", hashToken(rawToken))
    .maybeSingle();
  if (!data) return;
  const q = data as { id: string; storefront_tenant_id: string; selected_tier: number; status: string };
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("storefront_tenant_id")
    .eq("id", profileId)
    .maybeSingle();
  if ((prof as { storefront_tenant_id: string | null } | null)?.storefront_tenant_id !== q.storefront_tenant_id) return;
  await assignCustomerTier(q.storefront_tenant_id, profileId, normalizeTier(q.selected_tier));
  await supabaseAdmin
    .from("storefront_quotes")
    .update({ customer_profile_id: profileId, updated_at: new Date().toISOString() })
    .eq("id", q.id);
}
