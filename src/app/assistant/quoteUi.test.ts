import { describe, it, expect } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuoteDrawer } from "./_components/QuoteDrawer";
import { QuoteProvider } from "./_components/useQuote";
import { ProductCards, QuoteBlock } from "./_components/Blocks";
import { getGuestQuoteSnapshot, guestSubtotal, readGuestQuote, setGuestQuantity, upsertGuestLine, writeGuestQuote, GUEST_QUOTE_KEY } from "./_components/guestQuote";
import type { QuoteFlags, QuoteView } from "./_components/types";

/**
 * Static renders of the quote UI. The provider's server state starts
 * empty in SSR, so the drawer is exercised through the exported section
 * components with fixture views; buttons that must never appear are
 * asserted absent by text.
 */
const COLOR = /\b(?:bg|text|border)-(?:green|amber|red|blue|yellow)-\d/;
const render = (el: ReactNode) => renderToStaticMarkup(el as Parameters<typeof renderToStaticMarkup>[0]);
const flags = (o: Partial<QuoteFlags> = {}): QuoteFlags => ({ write_tools_enabled: false, checkout_enabled: false, ...o });
const wrap = (viewer: "user" | "guest" | "anonymous", f: QuoteFlags, child: ReactNode) => createElement(QuoteProvider, { viewer, flags: f } as Parameters<typeof QuoteProvider>[0], child);

const VIEW: QuoteView = {
  quote_id: "q1", quote_number: "VQ-260908-0001", status: "confirmed", version: 2, currency: "USD", subtotal: 4200, total: 4200, tax_status: "pre_tax",
  tax_note: "Prices are pre-tax. Tax is calculated on the final QuickBooks invoice.", expires_at: "2026-09-15T00:00:00Z", confirmed_at: "2026-09-08T00:00:00Z",
  financing: { program: null, status: "none" }, agreement_state: "not_required",
  lines: [
    { line_id: "l1", ref: "vendera-ai-cooler", source_type: "catalog_item", description: "VendEra AI Cooler", quantity: 1, unit_price: 3700, line_total: 3700, pricing_basis: "catalog_fixed", is_auto_add_on: false, parent_line_id: null, validation_status: "valid", staff_determined: false },
    { line_id: "l2", ref: "vending-machine-freight", source_type: "catalog_item", description: "Vending Machine Freight", quantity: 1, unit_price: 500, line_total: 500, pricing_basis: "catalog_fixed", is_auto_add_on: true, parent_line_id: "l1", validation_status: "valid", staff_determined: false },
  ],
  changes: [], notices: [], checkout: { available: false, blocked_reasons: [{ code: "agreement_missing", message: "A signed machine purchase agreement is required before checkout." }], location_intake_quantity: 0 },
};

describe("product card actions", () => {
  const cards = (items: Array<Record<string, unknown>>, viewer: "user" | "guest" = "guest") => render(wrap(viewer, flags(), createElement(ProductCards, { items })));
  it("financing rows offer an application, never a $0 checkout or add-to-quote", () => {
    const html = cards([{ kind: "commerce", product_id: "x", catalog_key: "financing-standard", name: "Financing", display_price: null, pricing_mode: "informational", action: "start_financing_application", availability: "available" }]);
    expect(html).toContain("Start financing application");
    expect(html).toContain("No catalog charge");
    expect(html).not.toContain("Add to quote");
    expect(html).not.toMatch(/checkout/i);
    expect(html).not.toMatch(/\$0\.00/);
  });
  it("direct and agreement items add to the quote; tiers are left to the location team", () => {
    const html = cards([
      { kind: "commerce", product_id: "a", catalog_key: "website-creation", name: "Website Creation", display_price: 500, unit: "each", pricing_mode: "priced", action: "add_to_quote", availability: "available" },
      { kind: "commerce", product_id: "b", catalog_key: "location-service-tier-2", name: "Location Services Tier 2", display_price: 800, unit: "each", pricing_mode: "requires_qualification", action: "request_qualification", availability: "available" },
    ]);
    expect(html.match(/Add to quote/g)?.length).toBe(1);
    expect(html).toContain("Determined by the location team");
  });
  it("buy-now listings link to the existing listing checkout; other listings get Request information", () => {
    const html = cards([
      { kind: "machine", product_id: "m1", name: "Cooler", display_price: 4799, price_basis: "buy_now", href: "/machines-for-sale/m1", availability: "available" },
      { kind: "machine", product_id: "m2", name: "Snack", display_price: 2500, price_basis: "asking", href: "/machines-for-sale/m2", availability: "available" },
    ]);
    expect(html).toContain('href="/machines-for-sale/m1"');
    expect(html).toContain("Buy now on the listing page");
    expect(html).toContain("Request information");
    expect(html).not.toContain("Add to quote");
  });
  it("coffee items add to the quote and everything stays on the monochrome + green palette", () => {
    const html = cards([{ kind: "coffee", product_id: "p1", name: "House Blend", display_price: 42.5, unit: "bag", availability: "in_stock" }]);
    expect(html).toContain("Add to quote");
    expect(html).not.toMatch(COLOR);
  });
});

describe("quote block", () => {
  it("shows server totals with the tax note and an Open quote action", () => {
    const html = render(wrap("user", flags(), createElement(QuoteBlock, { status: "quote", message: null, quote: { quote_number: "VQ-1", total: 4200, tax_note: VIEW.tax_note, lines: VIEW.lines } })));
    expect(html).toContain("Quote VQ-1");
    expect(html).toContain("$4,200.00");
    expect(html).toContain("QuickBooks invoice");
    expect(html).toContain("Open quote");
    const guest = render(wrap("guest", flags(), createElement(QuoteBlock, { status: "guest", message: "Sign in to save a quote.", quote: null })));
    expect(guest).toContain("Sign in to save a quote.");
  });
});

describe("quote drawer", () => {
  it("is closed by default and renders the guest body when opened for a guest", () => {
    expect(render(wrap("guest", flags(), createElement(QuoteDrawer)))).toBe("");
  });
});

describe("guest quote persistence", () => {
  function memoryStorage() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  }
  it("round-trips through storage, merges quantities, removes at zero, and rejects garbage", () => {
    const s = memoryStorage();
    let lines = upsertGuestLine([], { ref: "website-creation", name: "Website Creation", quantity: 1, unit_price: 500 });
    lines = upsertGuestLine(lines, { ref: "website-creation", name: "Website Creation", quantity: 2, unit_price: 500 });
    writeGuestQuote(lines, s);
    expect(readGuestQuote(s)).toEqual([{ ref: "website-creation", name: "Website Creation", quantity: 3, unit_price: 500 }]);
    expect(guestSubtotal(readGuestQuote(s))).toBe(1500);
    writeGuestQuote(setGuestQuantity(lines, "website-creation", 0), s);
    expect(readGuestQuote(s)).toEqual([]);
    s.setItem(GUEST_QUOTE_KEY, JSON.stringify([{ ref: 1 }, { ref: "x", name: "y", quantity: 0 }, "junk"]));
    expect(readGuestQuote(s)).toEqual([]);
    expect(getGuestQuoteSnapshot()).toEqual([]);
  });
});
