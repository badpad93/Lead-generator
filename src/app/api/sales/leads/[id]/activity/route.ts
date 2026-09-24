import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import {
  canRepSeeLead,
  normalizeEmail,
  dedupeById,
  type LeadOrderSummary,
  type LeadQuoteSummary,
  type LeadAgreementSummary,
  type LeadCustomerActivity,
} from "@/lib/leadActivity";

/**
 * GET /api/sales/leads/[id]/activity
 *
 * Returns the assigned lead's customer activity — CRM orders, commerce quotes,
 * and agreements — so the lead owner can see everything the customer has done.
 * Scoped like the lead list: a `sales` rep only sees activity for leads
 * assigned to them (see canRepSeeLead).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("sales_leads")
    .select("id, email, account_id, assigned_to")
    .eq("id", id)
    .single();
  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Own-customers-only: block reps who don't own this lead.
  if (!canRepSeeLead(lead.assigned_to, user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = normalizeEmail(lead.email);

  const [orders, { quotes, agreements }] = await Promise.all([
    fetchOrders(lead.id, lead.account_id, email),
    fetchQuotesAndAgreements(lead.id, email),
  ]);

  const payload: LeadCustomerActivity = { orders, quotes, agreements };
  return NextResponse.json(payload);
}

/** Orders linked directly to the lead, its account, or the customer email. */
async function fetchOrders(
  leadId: string,
  accountId: string | null,
  email: string | null,
): Promise<LeadOrderSummary[]> {
  const filters = [`lead_id.eq.${leadId}`];
  if (accountId) filters.push(`account_id.eq.${accountId}`);
  if (email) filters.push(`recipient_email.ilike.${email}`);

  const { data } = await supabaseAdmin
    .from("sales_orders")
    .select("id, order_number, order_status, status, total_value, payment_status, created_at")
    .or(filters.join(","))
    .order("created_at", { ascending: false });

  return dedupeById(data || []).map((o) => ({
    id: o.id,
    order_number: o.order_number ?? null,
    status: o.order_status ?? o.status ?? null,
    total_value: o.total_value ?? null,
    payment_status: o.payment_status ?? null,
    created_at: o.created_at ?? null,
  }));
}

/** Quotes and agreements owned by the customer profile matched on email. */
async function fetchQuotesAndAgreements(
  leadId: string,
  email: string | null,
): Promise<{ quotes: LeadQuoteSummary[]; agreements: LeadAgreementSummary[] }> {
  const profileId = email ? await findProfileIdByEmail(email) : null;

  const [quotes, userAgreements, locationAgreements] = await Promise.all([
    profileId ? fetchQuotes(profileId) : Promise.resolve([]),
    profileId ? fetchUserAgreements(profileId) : Promise.resolve([]),
    fetchLocationAgreements(leadId),
  ]);

  return { quotes, agreements: [...userAgreements, ...locationAgreements] };
}

async function findProfileIdByEmail(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function fetchQuotes(profileId: string): Promise<LeadQuoteSummary[]> {
  const { data } = await supabaseAdmin
    .from("commerce_quotes")
    .select("id, quote_number, status, total, created_at")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false });
  return (data || []).map((q) => ({
    id: q.id,
    quote_number: q.quote_number ?? null,
    status: q.status ?? null,
    total: q.total ?? null,
    created_at: q.created_at ?? null,
  }));
}

async function fetchUserAgreements(profileId: string): Promise<LeadAgreementSummary[]> {
  const { data } = await supabaseAdmin
    .from("user_agreements")
    .select("id, agreement_type, status, created_at")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false });
  return (data || []).map((a) => ({
    id: a.id,
    kind: "user_agreement" as const,
    agreement_type: a.agreement_type ?? null,
    status: a.status ?? null,
    created_at: a.created_at ?? null,
  }));
}

async function fetchLocationAgreements(leadId: string): Promise<LeadAgreementSummary[]> {
  const { data } = await supabaseAdmin
    .from("location_agreements")
    .select("id, status, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  return (data || []).map((a) => ({
    id: a.id,
    kind: "location_agreement" as const,
    agreement_type: "location_placement",
    status: a.status ?? null,
    created_at: a.created_at ?? null,
  }));
}
