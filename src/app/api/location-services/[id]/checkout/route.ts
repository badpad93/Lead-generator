import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { getSellableLocator, getLowestLocatorRateCents, validHours, weeklyAmountCents } from "@/lib/locationServices";
import { billWeek } from "@/lib/locationServicesBilling";
import { sendLocationServiceConfirmation } from "@/lib/locationServicesEmail";

/**
 * POST /api/location-services/[id]/checkout
 *
 * Hire a locator (or "any" available locator) on a recurring weekly plan.
 * Captures the customer's location-needs questionnaire, charges the first week
 * up front (QuickBooks invoice), and creates a subscription a scheduled sweep
 * re-bills weekly. "any" is priced at the lowest active locator rate.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const trimStr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

interface Target { locatorId: string | null; name: string; hourlyRateCents: number; anyLocator: boolean }

async function resolveTarget(id: string): Promise<Target | null> {
  if (id === "any") {
    const cents = await getLowestLocatorRateCents();
    if (!cents) return null;
    return { locatorId: null, name: "Any available locator", hourlyRateCents: cents, anyLocator: true };
  }
  const loc = await getSellableLocator(id);
  if (!loc) return null;
  return { locatorId: loc.id, name: loc.name, hourlyRateCents: loc.hourlyRateCents, anyLocator: false };
}

function validateContact(body: Record<string, unknown>): NextResponse | null {
  if (!trimStr(body.full_name) || !trimStr(body.email)) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }
  if (!validHours(body.hours)) {
    return NextResponse.json({ error: "Hours must be a multiple of 5, from 15 to 40" }, { status: 400 });
  }
  return null;
}

function validateNeeds(needs: Record<string, unknown>): NextResponse | null {
  for (const k of ["business_name", "address", "state", "machine_type"]) {
    if (!trimStr(needs[k])) return NextResponse.json({ error: "Please complete the location questionnaire" }, { status: 400 });
  }
  const zips = Array.isArray(needs.zip_codes) ? needs.zip_codes.filter((z) => trimStr(z)) : [];
  if (zips.length === 0) return NextResponse.json({ error: "Enter at least one target ZIP code" }, { status: 400 });
  if (!Number.isFinite(Number(needs.machine_count)) || Number(needs.machine_count) < 1) {
    return NextResponse.json({ error: "Enter the number of machines" }, { status: 400 });
  }
  return null;
}

async function createSubscription(args: {
  target: Target; userId: string | null; body: Record<string, unknown>;
  hours: number; weeklyCents: number; needs: Record<string, unknown>; now: Date;
}): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("location_service_subscriptions")
    .insert({
      locator_id: args.target.locatorId,
      any_locator: args.target.anyLocator,
      user_id: args.userId,
      full_name: trimStr(args.body.full_name),
      email: trimStr(args.body.email),
      phone: trimStr(args.body.phone) || null,
      hours_per_week: args.hours,
      hourly_rate_cents: args.target.hourlyRateCents,
      weekly_amount_cents: args.weeklyCents,
      status: "active",
      call_requested: true,
      location_needs: args.needs,
      next_bill_at: new Date(args.now.getTime() + WEEK_MS).toISOString(),
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function invoiceAndRespond(args: {
  target: Target; body: Record<string, unknown>; subId: string | null; hours: number; weeklyCents: number; now: Date;
}): Promise<NextResponse> {
  const { target, body, subId, hours, weeklyCents, now } = args;
  try {
    const { invoiceId, invoiceUrl } = await billWeek({
      email: trimStr(body.email), name: trimStr(body.full_name), locatorName: target.name,
      hours, weeklyAmountCents: weeklyCents, subId: subId ?? "",
    });
    if (subId) {
      await supabaseAdmin
        .from("location_service_subscriptions")
        .update({ qb_invoice_id: invoiceId, last_billed_at: now.toISOString(), invoices_count: 1 })
        .eq("id", subId);
    }
    await sendLocationServiceConfirmation({
      customerEmail: trimStr(body.email), customerName: trimStr(body.full_name),
      locatorName: target.name, hours, weeklyAmountCents: weeklyCents, invoiceUrl,
    }).catch(() => null);
    return NextResponse.json({ ok: true, url: invoiceUrl ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed";
    console.error("[location-services-checkout] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const target = await resolveTarget(id);
  if (!target) return NextResponse.json({ error: "This locator is not available" }, { status: 404 });

  const needs = (body.location_needs as Record<string, unknown>) || {};
  const invalid = validateContact(body) || validateNeeds(needs);
  if (invalid) return invalid;

  const hours = body.hours as number;
  const weeklyCents = weeklyAmountCents(target.hourlyRateCents, hours);
  const now = new Date();
  const userId = await getUserIdFromRequest(req);
  const subId = await createSubscription({ target, userId, body, hours, weeklyCents, needs, now });

  return invoiceAndRespond({ target, body, subId, hours, weeklyCents, now });
}
