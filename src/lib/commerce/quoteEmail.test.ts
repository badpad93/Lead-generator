import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QuoteView } from "./quoteView";

/**
 * The quote email carries only customer-visible quote facts. Resend is
 * a scripted fake; no network.
 */
const sent: Array<Record<string, unknown>> = [];
const resend = { fail: false };
vi.mock("@/lib/resendClient", () => ({
  getResendClient: () => ({ emails: { send: async (m: Record<string, unknown>) => { sent.push(m); return resend.fail ? { error: { message: "boom" } } : { data: { id: "em_1" }, error: null }; } } }),
}));

import { escapeHtml, renderQuoteEmail, sendQuoteEmail } from "./quoteEmail";

const VIEW: QuoteView = {
  quote_id: "11111111-1111-4111-8111-000000000001", quote_number: "VQ-260908-0007", status: "confirmed", version: 3, currency: "USD", subtotal: 4200, total: 4200, tax_status: "pre_tax",
  tax_note: "Prices are pre-tax. Tax is calculated on the final QuickBooks invoice.", expires_at: "2026-09-15T12:00:00Z", confirmed_at: "2026-09-08T12:00:00Z",
  financing: { program: "standard", status: "interested" }, agreement_state: "not_required",
  lines: [
    { line_id: "l1", ref: "vendera-ai-cooler", source_type: "catalog_item", description: "VendEra AI <Cooler> & co", quantity: 1, unit_price: 3700, line_total: 3700, pricing_basis: "catalog_fixed", is_auto_add_on: false, parent_line_id: null, validation_status: "valid", staff_determined: false },
    { line_id: "l2", ref: "vending-machine-freight", source_type: "catalog_item", description: "Vending Machine Freight", quantity: 1, unit_price: 500, line_total: 500, pricing_basis: "catalog_fixed", is_auto_add_on: true, parent_line_id: "l1", validation_status: "valid", staff_determined: false },
    { line_id: "l3", ref: "flavia-c600-brewer", source_type: "catalog_item", description: "Flavia C600 Brewer", quantity: 1, unit_price: 0, line_total: 0, pricing_basis: "no_charge", is_auto_add_on: false, parent_line_id: null, validation_status: "valid", staff_determined: false },
  ],
  changes: [], notices: [], checkout: { available: false, blocked_reasons: [], location_intake_quantity: 0 },
};

beforeEach(() => {
  sent.length = 0;
  resend.fail = false;
});

describe("renderQuoteEmail", () => {
  it("lists lines, the pre-tax total, the tax note, and the expiration; escapes HTML", () => {
    const r = renderQuoteEmail({ to: "jamie@example.com", view: VIEW, payUrl: null, financingUrl: null, appUrl: "https://preview.example" });
    expect(r.subject).toBe("Your Vending Connector quote VQ-260908-0007");
    expect(r.html).toContain("VendEra AI &lt;Cooler&gt; &amp; co");
    expect(r.html).not.toContain("<Cooler>");
    expect(r.html).toContain("$4,200.00");
    expect(r.html).toContain("Total (pre-tax)");
    expect(r.html).toContain("Tax is calculated on the final QuickBooks invoice.");
    expect(r.html).toContain("valid until September 15, 2026");
    expect(r.html).toContain("https://preview.example/assistant");
    expect(r.text).toContain("VendEra AI <Cooler> & co x 1: $3,700.00");
  });
  it("shows $0 catalog charges as 'No catalog charge', never 'free'", () => {
    const r = renderQuoteEmail({ to: "a@b.c", view: VIEW, payUrl: null, financingUrl: null });
    expect(r.html).toContain("No catalog charge");
    expect(r.html).not.toMatch(/\bfree\b/i);
    expect(r.text).toContain("Flavia C600 Brewer x 1: No catalog charge");
  });
  it("includes the QuickBooks pay link and the financing link only when supplied, with the non-approval wording", () => {
    const none = renderQuoteEmail({ to: "a@b.c", view: VIEW, payUrl: null, financingUrl: null });
    expect(none.html).not.toContain("Pay securely");
    expect(none.html).not.toContain("financing application");
    const both = renderQuoteEmail({ to: "a@b.c", view: VIEW, payUrl: "https://connect.intuit.com/pay/abc", financingUrl: "/financing?quote=x.y", appUrl: "https://preview.example/" });
    expect(both.html).toContain('href="https://connect.intuit.com/pay/abc"');
    expect(both.html).toContain("Pay securely with QuickBooks");
    expect(both.html).toContain('href="https://preview.example/financing?quote=x.y"');
    expect(both.html).toContain("not an approval, a rate, a term, or a reduction of the amount due");
    expect(both.text).toContain("https://preview.example/financing?quote=x.y");
  });
  it("never carries QuickBooks ids or financial-application fields", () => {
    const r = renderQuoteEmail({ to: "a@b.c", view: VIEW, payUrl: "https://connect.intuit.com/pay/abc", financingUrl: "/financing?quote=x.y" });
    for (const s of [r.html, r.text]) {
      expect(s).not.toMatch(/qb_|Invoice Id|INV-|ssn|social security|credit score|income|bank account/i);
    }
  });
  it("escapeHtml covers the five specials", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("sendQuoteEmail", () => {
  it("sends one message to the given recipient with html and text bodies", async () => {
    await sendQuoteEmail({ to: "jamie@example.com", view: VIEW, payUrl: null, financingUrl: null });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("jamie@example.com");
    expect(String(sent[0].subject)).toContain("VQ-260908-0007");
    expect(typeof sent[0].html).toBe("string");
    expect(typeof sent[0].text).toBe("string");
  });
  it("surfaces a Resend error instead of reporting success", async () => {
    resend.fail = true;
    await expect(sendQuoteEmail({ to: "jamie@example.com", view: VIEW, payUrl: null, financingUrl: null })).rejects.toThrow(/Resend rejected/);
  });
});
