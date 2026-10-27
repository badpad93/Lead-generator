import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createInvoice, sendInvoiceEmail, getInvoice } from "@/lib/quickbooks";
import { sendLocationServiceCancellation } from "@/lib/locationServicesEmail";

/**
 * Weekly billing for Location Services.
 *
 * - billWeek(): create + email one weekly invoice (used by checkout + sweep).
 * - runLocationServiceSweep(): the recurring job. For each subscription due to
 *   be re-billed, it first checks the prior week's invoice: if it was paid, it
 *   bills the next week; if it is still unpaid, it cancels the subscription and
 *   fires non-payment cancellation notices (customer + admin + locator).
 *
 * Duplicate-bill safety: each due row is "claimed" by advancing next_bill_at
 * with an optimistic conditional update, so a concurrent or re-run sweep can
 * never bill the same week twice.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface BillResult {
  invoiceId: string;
  invoiceUrl: string | null;
}

/** Create + email a weekly location-services invoice. */
export async function billWeek(args: {
  email: string; name: string; locatorName: string; hours: number; weeklyAmountCents: number; subId: string;
}): Promise<BillResult> {
  const invoice = await createInvoice({
    customerEmail: args.email,
    customerName: args.name,
    lineItems: [{ description: `Location services — ${args.locatorName} — ${args.hours} hrs/week`, amount: args.weeklyAmountCents / 100 }],
    memo: `Weekly location services — ${args.locatorName}`,
    metadata: { type: "location_service", subscription_id: args.subId },
  });
  await sendInvoiceEmail(invoice.Id, args.email);
  const full = await getInvoice(invoice.Id);
  return { invoiceId: invoice.Id, invoiceUrl: full.InvoiceLink ?? null };
}

interface LocatorRef { name?: string; email?: string | null }
interface SubRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  hours_per_week: number;
  weekly_amount_cents: number;
  qb_invoice_id: string | null;
  next_bill_at: string;
  invoices_count: number | null;
  location_service_locators: LocatorRef | null;
}

/** true = paid, false = unpaid, null = could not determine (skip this run). */
async function priorInvoicePaid(invoiceId: string | null): Promise<boolean | null> {
  if (!invoiceId) return true;
  try {
    const inv = await getInvoice(invoiceId);
    return (inv.Balance ?? 0) <= 0;
  } catch {
    return null;
  }
}

/** Reserve the row by advancing next_bill_at; returns false if already claimed. */
async function claim(sub: SubRow, now: Date): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("location_service_subscriptions")
    .update({ next_bill_at: new Date(now.getTime() + WEEK_MS).toISOString() })
    .eq("id", sub.id)
    .eq("status", "active")
    .eq("next_bill_at", sub.next_bill_at)
    .select("id");
  return Boolean(data && data.length > 0);
}

async function cancelForNonpayment(sub: SubRow, now: Date): Promise<void> {
  await supabaseAdmin
    .from("location_service_subscriptions")
    .update({ status: "cancelled", cancelled_at: now.toISOString() })
    .eq("id", sub.id);
  const loc = sub.location_service_locators;
  await sendLocationServiceCancellation({
    customerEmail: sub.email,
    customerName: sub.full_name || "there",
    customerPhone: sub.phone,
    locatorName: loc?.name || "your locator",
    locatorEmail: loc?.email || null,
    weeklyAmountCents: sub.weekly_amount_cents,
  });
}

async function billNextWeek(sub: SubRow, now: Date): Promise<void> {
  const loc = sub.location_service_locators;
  const { invoiceId } = await billWeek({
    email: sub.email,
    name: sub.full_name || "Customer",
    locatorName: loc?.name || "Locator",
    hours: sub.hours_per_week,
    weeklyAmountCents: sub.weekly_amount_cents,
    subId: sub.id,
  });
  await supabaseAdmin
    .from("location_service_subscriptions")
    .update({ qb_invoice_id: invoiceId, last_billed_at: now.toISOString(), invoices_count: (sub.invoices_count ?? 0) + 1 })
    .eq("id", sub.id);
}

export interface SweepSummary { billed: number; cancelled: number; skipped: number }

/** Process every subscription whose next weekly invoice is due. */
export async function runLocationServiceSweep(now = new Date()): Promise<SweepSummary> {
  const { data: due } = await supabaseAdmin
    .from("location_service_subscriptions")
    .select("*, location_service_locators(name, email)")
    .eq("status", "active")
    .lte("next_bill_at", now.toISOString())
    .limit(200);

  const summary: SweepSummary = { billed: 0, cancelled: 0, skipped: 0 };
  for (const sub of (due || []) as SubRow[]) {
    const paid = await priorInvoicePaid(sub.qb_invoice_id);
    if (paid === null) { summary.skipped++; continue; }
    if (!(await claim(sub, now))) { summary.skipped++; continue; }
    if (paid) {
      await billNextWeek(sub, now);
      summary.billed++;
    } else {
      await cancelForNonpayment(sub, now);
      summary.cancelled++;
    }
  }
  return summary;
}
