/**
 * Payment reminder engine — walks open + partially_paid + overdue invoices
 * and figures out the next reminder stage to send. Idempotent per invoice per
 * stage — we track `last_reminder_stage` + `last_reminder_at` and never
 * repeat a stage.
 *
 * Stages, keyed off invoice.due_date (or invoice.sent_at as fallback):
 *   sent              — 0 hours after invoice send confirmation
 *   pre_due_3         — 3 days before due date
 *   due_today         — day of due date
 *   overdue_3         — 3 days past due
 *   overdue_7         — 7 days past due
 *   admin_escalation  — 14 days past due
 *
 * A single hourly cron pass runs this. Each stage's guard requires the
 * previous stage to have fired (so a fresh invoice doesn't jump straight to
 * overdue_7 if it was inserted late).
 */

import { Resend } from "resend";
import { supabaseAdmin } from "./supabaseAdmin";
import { writeAuditLog } from "./paymentLedger";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
const ADMIN_ESCALATION_EMAIL = process.env.MARKETPLACE_ADMIN_NOTIFICATIONS_EMAIL || "james@apexaivending.com";

type Stage = "sent" | "pre_due_3" | "due_today" | "overdue_3" | "overdue_7" | "admin_escalation";

interface InvoiceRow {
  id: string;
  buyer_email: string | null;
  buyer_name: string | null;
  total_cents: number;
  balance_due_cents: number;
  currency: string;
  due_date: string | null;
  sent_at: string | null;
  status: string;
  provider: string;
  provider_invoice_url: string | null;
  memo: string | null;
  last_reminder_stage: string | null;
  last_reminder_at: string | null;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Decide the next stage for an invoice, or null if nothing to send now.
 */
export function nextStageFor(inv: InvoiceRow, now: Date): Stage | null {
  const due = inv.due_date ? new Date(inv.due_date) : null;
  const sent = inv.sent_at ? new Date(inv.sent_at) : null;
  const anchor = due || sent;
  if (!anchor) return null;
  const daysToDue = due ? daysBetween(now, due) : null; // positive = future
  const daysPastDue = due ? -daysBetween(now, due) : null;

  const already = new Set<string>();
  if (inv.last_reminder_stage) already.add(inv.last_reminder_stage);

  // Stages fire in order — each one requires the previous to have fired
  // (or the previous stage's window to have passed).
  if (!already.has("sent") && sent) return "sent";
  if (!already.has("pre_due_3") && daysToDue !== null && daysToDue <= 3 && daysToDue > 0) return "pre_due_3";
  if (!already.has("due_today") && daysToDue !== null && daysToDue <= 0 && daysPastDue !== null && daysPastDue <= 0) return "due_today";
  if (!already.has("overdue_3") && daysPastDue !== null && daysPastDue >= 3 && daysPastDue < 7) return "overdue_3";
  if (!already.has("overdue_7") && daysPastDue !== null && daysPastDue >= 7 && daysPastDue < 14) return "overdue_7";
  if (!already.has("admin_escalation") && daysPastDue !== null && daysPastDue >= 14) return "admin_escalation";

  return null;
}

function renderShell({ heading, intro, cta, invoice, footer }: { heading: string; intro: string; cta?: { label: string; href: string }; invoice: InvoiceRow; footer?: string }): string {
  const balance = (Number(invoice.balance_due_cents) / 100).toLocaleString(undefined, { style: "currency", currency: invoice.currency || "USD" });
  const total = (Number(invoice.total_cents) / 100).toLocaleString(undefined, { style: "currency", currency: invoice.currency || "USD" });
  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:40px 24px;color:#111827;">
  <div style="text-align:center;margin-bottom:24px;"><h1 style="color:#16a34a;font-size:22px;margin:0;">Vending Connector</h1></div>
  <h2 style="font-size:18px;margin:0 0 12px;">${heading}</h2>
  <p style="font-size:14px;color:#374151;line-height:1.6;">${intro}</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb;color:#6b7280;font-size:12px;">Total</td><td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:12px;text-align:right;">${total}</td></tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb;color:#6b7280;font-size:12px;">Balance due</td><td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:600;color:${invoice.balance_due_cents > 0 ? "#dc2626" : "#16a34a"};">${balance}</td></tr>
    ${invoice.due_date ? `<tr><td style="padding:6px 8px;border:1px solid #e5e7eb;color:#6b7280;font-size:12px;">Due date</td><td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:12px;text-align:right;">${new Date(invoice.due_date).toLocaleDateString()}</td></tr>` : ""}
  </table>
  ${cta ? `<div style="text-align:center;margin:24px 0;"><a href="${cta.href}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${cta.label}</a></div>` : ""}
  ${footer ? `<p style="font-size:12px;color:#9ca3af;margin-top:16px;">${footer}</p>` : ""}
</div>`;
}

function stageContent(stage: Stage, inv: InvoiceRow): { subject: string; heading: string; intro: string; recipient: string; cta?: { label: string; href: string } } {
  const payLink = inv.provider_invoice_url || `${SITE_URL}/account/invoices`;
  const cta = { label: "Pay invoice", href: payLink };
  switch (stage) {
    case "sent":
      return {
        subject: "Your invoice from Vending Connector",
        heading: "Your invoice is ready",
        intro: "Thanks for your business. You can review and pay at your convenience using the button below.",
        recipient: inv.buyer_email || "",
        cta,
      };
    case "pre_due_3":
      return {
        subject: "Reminder: invoice due in 3 days",
        heading: "Reminder — payment due soon",
        intro: "A friendly reminder that your invoice is due in 3 days.",
        recipient: inv.buyer_email || "",
        cta,
      };
    case "due_today":
      return {
        subject: "Reminder: invoice due today",
        heading: "Reminder — payment due today",
        intro: "Your invoice is due today. Please complete payment when convenient.",
        recipient: inv.buyer_email || "",
        cta,
      };
    case "overdue_3":
      return {
        subject: "Past due: invoice 3 days overdue",
        heading: "Your invoice is now past due",
        intro: "We haven't received payment yet. Please pay as soon as possible to avoid interruptions.",
        recipient: inv.buyer_email || "",
        cta,
      };
    case "overdue_7":
      return {
        subject: "Past due: invoice 7 days overdue",
        heading: "Invoice significantly past due",
        intro: "Your invoice is now more than 7 days past due. Please pay immediately, or reply to this email to discuss.",
        recipient: inv.buyer_email || "",
        cta,
      };
    case "admin_escalation":
      return {
        subject: `Admin escalation: invoice past due 14+ days (${inv.buyer_email || "(no email)"})`,
        heading: "Invoice escalation",
        intro: `Invoice ${inv.id.slice(0, 8)} for ${inv.buyer_email || "(no email)"} is past due by 14+ days with balance ${(Number(inv.balance_due_cents) / 100).toLocaleString()}. Human follow-up needed.`,
        recipient: ADMIN_ESCALATION_EMAIL,
      };
  }
}

export interface ReminderRun {
  scanned: number;
  sent: number;
  skipped_no_email: number;
  errors: string[];
}

export async function runPaymentReminders(): Promise<ReminderRun> {
  const summary: ReminderRun = { scanned: 0, sent: 0, skipped_no_email: 0, errors: [] };
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    summary.errors.push("RESEND_API_KEY not configured");
    return summary;
  }
  const resend = new Resend(resendKey);
  const now = new Date();

  const { data: invoices } = await supabaseAdmin
    .from("invoices")
    .select("id, buyer_email, buyer_name, total_cents, balance_due_cents, currency, due_date, sent_at, status, provider, provider_invoice_url, memo, last_reminder_stage, last_reminder_at")
    .in("status", ["open", "partially_paid", "overdue"])
    .gt("balance_due_cents", 0)
    .limit(500);

  for (const inv of (invoices || []) as InvoiceRow[]) {
    summary.scanned++;
    const stage = nextStageFor(inv, now);
    if (!stage) continue;
    const content = stageContent(stage, inv);
    if (!content.recipient) {
      summary.skipped_no_email++;
      continue;
    }
    const html = renderShell({ heading: content.heading, intro: content.intro, cta: content.cta, invoice: inv });

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: content.recipient,
        subject: content.subject,
        html,
      });
      await supabaseAdmin
        .from("invoices")
        .update({
          last_reminder_stage: stage,
          last_reminder_at: now.toISOString(),
        })
        .eq("id", inv.id);
      await writeAuditLog({
        actorId: null,
        action: "invoice_reminder_sent",
        entityType: "invoice",
        entityId: inv.id,
        metadata: { stage, recipient: content.recipient },
      });
      summary.sent++;
    } catch (e) {
      summary.errors.push(`${inv.id.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return summary;
}
