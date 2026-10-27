import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { getSellableLocator, validHours, weeklyAmountCents } from "@/lib/locationServices";
import { billWeek } from "@/lib/locationServicesBilling";
import { sendLocationServiceConfirmation } from "@/lib/locationServicesEmail";

/**
 * POST /api/location-services/[id]/checkout
 *
 * Guest checkout to hire a locator on a recurring weekly plan — no account
 * required. Body: { full_name, email, phone, hours }. Charges the first
 * week up front (QuickBooks invoice) and creates an active subscription that
 * a scheduled sweep re-bills weekly. The locator will call the customer.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const trimStr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function validate(body: Record<string, unknown>): NextResponse | null {
  if (!trimStr(body.full_name) || !trimStr(body.email)) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }
  if (!validHours(body.hours)) {
    return NextResponse.json({ error: "Hours must be a multiple of 5, from 15 to 40" }, { status: 400 });
  }
  return null;
}

async function createSubscription(args: {
  locatorId: string; userId: string | null; body: Record<string, unknown>;
  hours: number; hourlyRateCents: number; weeklyCents: number; now: Date;
}): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("location_service_subscriptions")
    .insert({
      locator_id: args.locatorId,
      user_id: args.userId,
      full_name: trimStr(args.body.full_name),
      email: trimStr(args.body.email),
      phone: trimStr(args.body.phone) || null,
      hours_per_week: args.hours,
      hourly_rate_cents: args.hourlyRateCents,
      weekly_amount_cents: args.weeklyCents,
      status: "active",
      call_requested: true,
      next_bill_at: new Date(args.now.getTime() + WEEK_MS).toISOString(),
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const locator = await getSellableLocator(id);
  if (!locator) return NextResponse.json({ error: "This locator is not available" }, { status: 404 });

  const invalid = validate(body);
  if (invalid) return invalid;

  const hours = body.hours as number;
  const weeklyCents = weeklyAmountCents(locator.hourlyRateCents, hours);
  const now = new Date();
  const userId = await getUserIdFromRequest(req);
  const subId = await createSubscription({
    locatorId: locator.id, userId, body, hours, hourlyRateCents: locator.hourlyRateCents, weeklyCents, now,
  });

  try {
    const { invoiceId, invoiceUrl } = await billWeek({
      email: trimStr(body.email), name: trimStr(body.full_name), locatorName: locator.name,
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
      locatorName: locator.name, hours, weeklyAmountCents: weeklyCents, invoiceUrl,
    }).catch(() => null);
    if (invoiceUrl) return NextResponse.json({ url: invoiceUrl });
    return NextResponse.json({ invoiceSent: true, invoiceId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed";
    console.error("[location-services-checkout] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
