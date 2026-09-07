import { getResendClient } from "@/lib/resendClient";
import type { QuoteView } from "./quoteView";

/**
 * Customer-facing quote email. Carries only what the customer can
 * already see in the drawer: the quote number, a line summary, the
 * pre-tax total and tax note, the expiration, the financing link when
 * the customer has expressed interest, and the QuickBooks-hosted pay
 * link when one has been issued. Never QuickBooks ids, never
 * financial-application data, never staff notes.
 */
export interface QuoteEmailInput {
  to: string;
  view: QuoteView;
  payUrl: string | null;
  financingUrl: string | null;
  appUrl?: string;
}

export interface RenderedQuoteEmail {
  subject: string;
  html: string;
  text: string;
}

const FROM = process.env.FROM_EMAIL || "sales@bytebitevending.com";
const DEFAULT_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function lineAmount(line: QuoteView["lines"][number]): string {
  return line.pricing_basis === "no_charge" ? "No catalog charge" : money(line.line_total);
}

function expiryLine(view: QuoteView): string | null {
  if (!view.expires_at) return null;
  const d = new Date(view.expires_at);
  return `This quote is valid until ${d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}.`;
}

function absolute(url: string, appUrl: string): string {
  return url.startsWith("/") ? `${appUrl}${url}` : url;
}

function htmlLinks(input: QuoteEmailInput, appUrl: string): string {
  const parts: string[] = [];
  if (input.payUrl) {
    parts.push(`<p style="margin:20px 0;text-align:center"><a href="${escapeHtml(input.payUrl)}" style="display:inline-block;background:#01B744;color:#fff;padding:12px 22px;border-radius:8px;font-weight:600;text-decoration:none">Pay securely with QuickBooks</a></p>`);
  }
  if (input.financingUrl) {
    parts.push(`<p style="font-size:13px;color:#374151">Interested in financing? <a href="${escapeHtml(absolute(input.financingUrl, appUrl))}" style="color:#01B744">Continue your financing application</a>. Financing interest is not an approval, a rate, a term, or a reduction of the amount due.</p>`);
  }
  parts.push(`<p style="font-size:13px;color:#374151">Review or change this quote any time at <a href="${escapeHtml(appUrl)}/assistant" style="color:#01B744">${escapeHtml(appUrl)}/assistant</a>.</p>`);
  return parts.join("\n");
}

function textLinks(input: QuoteEmailInput, appUrl: string): string[] {
  const out: string[] = [];
  if (input.payUrl) out.push(`Pay securely with QuickBooks: ${input.payUrl}`);
  if (input.financingUrl) out.push(`Continue your financing application: ${absolute(input.financingUrl, appUrl)} (interest is not an approval, a rate, a term, or a reduction of the amount due)`);
  out.push(`Review or change this quote: ${appUrl}/assistant`);
  return out;
}

export function renderQuoteEmail(input: QuoteEmailInput): RenderedQuoteEmail {
  const { view } = input;
  const appUrl = (input.appUrl ?? DEFAULT_APP_URL).replace(/\/$/, "");
  const expiry = expiryLine(view);
  const rows = view.lines
    .map((l) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(l.description)}${l.is_auto_add_on ? " <span style=\"color:#6b7280\">(freight)</span>" : ""}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${l.quantity}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${lineAmount(l)}</td></tr>`)
    .join("\n");
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">
      <p style="font-size:20px;font-weight:700;color:#01B744;margin:0 0 16px">Vending Connector</p>
      <h2 style="font-size:18px;margin:0 0 4px">Quote ${escapeHtml(view.quote_number)}</h2>
      <p style="font-size:13px;color:#6b7280;margin:0 0 16px">Status: ${escapeHtml(view.status)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr><th style="text-align:left;padding:6px 8px">Item</th><th style="padding:6px 8px">Qty</th><th style="text-align:right;padding:6px 8px">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:16px;font-weight:700;text-align:right;margin:16px 0 4px">Total (pre-tax): ${money(view.total)}</p>
      <p style="font-size:12px;color:#6b7280;text-align:right;margin:0 0 16px">${escapeHtml(view.tax_note)}</p>
      ${expiry ? `<p style="font-size:13px;color:#374151">${escapeHtml(expiry)}</p>` : ""}
      ${htmlLinks(input, appUrl)}
    </div>`;
  const text = [
    `Vending Connector — Quote ${view.quote_number} (${view.status})`,
    "",
    ...view.lines.map((l) => `${l.description} x ${l.quantity}: ${lineAmount(l)}`),
    "",
    `Total (pre-tax): ${money(view.total)}`,
    view.tax_note,
    ...(expiry ? ["", expiry] : []),
    "",
    ...textLinks(input, appUrl),
  ].join("\n");
  return { subject: `Your Vending Connector quote ${view.quote_number}`, html, text };
}

export async function sendQuoteEmail(input: QuoteEmailInput): Promise<void> {
  const rendered = renderQuoteEmail(input);
  const { error } = await getResendClient().emails.send({ from: FROM, to: input.to, subject: rendered.subject, html: rendered.html, text: rendered.text });
  if (error) throw new Error(`Resend rejected the quote email: ${error.message}`);
}
