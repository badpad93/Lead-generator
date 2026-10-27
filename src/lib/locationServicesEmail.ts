import { Resend } from "resend";

/**
 * Transactional emails for Location Services: the purchase confirmation and
 * the non-payment cancellation notices (customer + admin + locator).
 */

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
const ADMIN_EMAIL = process.env.LOCATION_SERVICES_ADMIN_EMAIL || process.env.COFFEE_ADMIN_EMAIL || "james@apexaivending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const money = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface ConfirmationParams {
  customerEmail: string;
  customerName: string;
  locatorName: string;
  hours: number;
  weeklyAmountCents: number;
  invoiceUrl?: string | null;
}

/** Confirmation to the customer after they start a weekly plan. */
export async function sendLocationServiceConfirmation(p: ConfirmationParams): Promise<void> {
  const pay = p.invoiceUrl
    ? `<p><a href="${p.invoiceUrl}" style="color:#16a34a;font-weight:600;">Pay your first week's invoice →</a></p>`
    : `<p>Your invoice has been emailed separately.</p>`;
  const html = `
    <h2>Your location services are booked</h2>
    <p>Hi ${esc(p.customerName)},</p>
    <p>You're set up with <strong>${esc(p.locatorName)}</strong> for <strong>${p.hours} hours per week</strong> at
    <strong>${money(p.weeklyAmountCents)}/week</strong>, billed weekly.</p>
    <p>${esc(p.locatorName)} will reach out by phone shortly to get started.</p>
    ${pay}
    <p style="color:#666;font-size:13px;">You're billed the weekly amount up front and again every 7 days until you cancel.
    If a weekly invoice goes unpaid, the plan is cancelled automatically.</p>
  `;
  await getResend().emails.send({ from: FROM_EMAIL, to: p.customerEmail, subject: `Location services booked — ${p.locatorName}`, html });
}

export interface CancellationParams {
  customerEmail: string;
  customerName: string;
  customerPhone?: string | null;
  locatorName: string;
  locatorEmail?: string | null;
  weeklyAmountCents: number;
}

/**
 * Non-payment cancellation notices. Sends to the customer, the admin, and the
 * locator (when a contact email is on file). Fire-and-forget per recipient so
 * one failure doesn't block the others.
 */
export async function sendLocationServiceCancellation(p: CancellationParams): Promise<void> {
  const resend = getResend();
  const amount = money(p.weeklyAmountCents);

  const customerHtml = `
    <h2>Your location services plan has been cancelled</h2>
    <p>Hi ${esc(p.customerName)},</p>
    <p>We weren't able to collect this week's payment of <strong>${amount}</strong> for your plan with
    <strong>${esc(p.locatorName)}</strong>, so the plan has been cancelled and weekly billing has stopped.</p>
    <p>If this was a mistake, reply to this email or contact us to restart your plan.</p>
  `;
  const adminHtml = `
    <h2>Location services cancelled — non-payment</h2>
    <p><strong>${esc(p.customerName)}</strong> (${esc(p.customerEmail)}${p.customerPhone ? `, ${esc(p.customerPhone)}` : ""})
    was cancelled for non-payment of this week's ${amount} with locator <strong>${esc(p.locatorName)}</strong>.</p>
  `;
  const locatorHtml = `
    <h2>A client plan was cancelled for non-payment</h2>
    <p>Your weekly plan with <strong>${esc(p.customerName)}</strong>
    (${esc(p.customerEmail)}${p.customerPhone ? `, ${esc(p.customerPhone)}` : ""}) has been cancelled because the
    weekly invoice of ${amount} went unpaid. You can stop outreach for this client.</p>
  `;

  const sends: Array<Promise<unknown>> = [
    resend.emails.send({ from: FROM_EMAIL, to: p.customerEmail, subject: "Your location services plan was cancelled", html: customerHtml }).catch(() => null),
    resend.emails.send({ from: FROM_EMAIL, to: ADMIN_EMAIL, subject: `Location services cancelled (non-payment) — ${p.customerName}`, html: adminHtml }).catch(() => null),
  ];
  if (p.locatorEmail) {
    sends.push(resend.emails.send({ from: FROM_EMAIL, to: p.locatorEmail, subject: "Client plan cancelled — non-payment", html: locatorHtml }).catch(() => null));
  }
  await Promise.all(sends);
}

function esc(s: string): string {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));
}
