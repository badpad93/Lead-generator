import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeSellingPrice } from "./marginPricing";

/*
 * Part 2 quote integration: the quote builder's markup/margin control feeds
 * ABSOLUTE per-line override prices; percentages are never persisted or sent
 * to the server, and the server re-derives line totals + margins from the
 * canonical unit cost (so a tampered total/percent can't stick). Internal
 * cost/margin never reaches the customer-facing quote.
 */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("quote-wide percentage produces an absolute price from cost", () => {
  it("markup 25% on a $10 cost line → $12.50 override", () => {
    expect(computeSellingPrice(10, 25, "markup")).toBe(12.5);
  });
  it("30% gross margin on a $14 cost line → $20.00 override", () => {
    expect(computeSellingPrice(14, 30, "margin")).toBe(20);
  });
});

describe("QuoteBuilder wiring", () => {
  const src = read("src/app/coffee/storefront/quotes/new/QuoteBuilder.tsx");
  it("uses the shared MarginPriceControl and a quote-wide apply", () => {
    expect(src).toContain("MarginPriceControl");
    expect(src).toContain("applyQuoteWidePercent");
    expect(src).toContain("Apply");
  });
  it("quote-wide apply derives each override from the line's unit_cost", () => {
    expect(src).toContain("computeSellingPrice(costByProduct.get(l.product_id)");
    expect(src).toContain("override_unit_price: price");
  });
  it("keeps the per-line override input + 'custom' indicator for post-apply edits", () => {
    expect(src).toContain("override_unit_price");
    expect(src).toContain("custom");
  });
  it("persists only lines/tier/notes — NO percentage or total sent to the server", () => {
    // The PATCH/POST bodies carry selected_tier + lines + notes; a raw pct or
    // client total would be a tamper vector, so it must not be in the payload.
    expect(src).toContain("selected_tier: tier, lines, notes");
    // No percentage / client total in either request body (tamper vectors).
    expect(src).not.toMatch(/body:\s*JSON\.stringify\([^)]*\bpct\b/);
    expect(src).not.toMatch(/body:\s*JSON\.stringify\([^)]*\bquotePct\b/);
  });
});

describe("server recomputes (tamper-safe) + never leaks cost/margin", () => {
  const quotes = read("src/lib/storefront/quotes.ts");
  it("buildLines recomputes each line via computeQuoteLine + computeQuoteTotals", () => {
    expect(quotes).toContain("computeQuoteLine");
    expect(quotes).toContain("computeQuoteTotals");
  });
  it("the public token view selects only customer-safe fields (no cost/margin)", () => {
    const fn = quotes.slice(quotes.indexOf("getPublicQuoteByToken"));
    const header = fn.slice(0, 1200);
    expect(header).not.toContain("unit_cost");
    expect(header).not.toContain("est_cost");
    expect(header).not.toContain("est_gross_profit");
    expect(header).not.toContain("gross_profit");
    expect(header).not.toContain("margin");
    // but DOES return the customer price + line total
    expect(header).toContain("quoted_unit_price");
    expect(header).toContain("line_total");
  });
});
