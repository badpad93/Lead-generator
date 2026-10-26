import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Admin coffee pricing-sheet PDF export. Source-level guards (the lib + route
 * import pdf-lib / the Supabase env), no rendering needed.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("coffee tier pricing sheet export", () => {
  it("the PDF generator renders the tier name + a product/price table", () => {
    const lib = read("src/lib/generateCoffeeTierSheetPdf.ts");
    expect(lib).toContain("export async function generateCoffeeTierSheetPdf");
    expect(lib).toContain("Coffee Pricing Sheet");
    expect(lib).toContain("UNIT PRICE");
  });
  it("the export route is admin-gated and resolves prices by tier", () => {
    const route = read("src/app/api/admin/coffee/tier-prices/pdf/route.ts");
    expect(route).toContain("getAdminUserId");
    expect(route).toContain("{ status: 403 }");
    expect(route).toContain("coffee_product_tier_prices");
    expect(route).toContain('"Content-Type": "application/pdf"');
    expect(route).toContain("generateCoffeeTierSheetPdf");
  });
  it("the tier-prices admin page exposes a tier selector + export button", () => {
    const page = read("src/app/admin/coffee/tier-prices/page.tsx");
    expect(page).toContain("ExportBar");
    expect(page).toContain("/api/admin/coffee/tier-prices/pdf?tier=");
    expect(page).toContain("Export PDF");
  });
  it("generates a valid PDF document from tier data", async () => {
    const { generateCoffeeTierSheetPdf } = await import("./generateCoffeeTierSheetPdf");
    const bytes = await generateCoffeeTierSheetPdf({
      tierName: "Tier 1",
      generatedAt: new Date("2026-01-01"),
      items: [
        { name: "House Blend 2lb", sku: "HB-2", price: 18.5, shipping: 4 },
        { name: "Decaf Pods 100ct", sku: null, price: 42, shipping: 0 },
      ],
    });
    expect(bytes.length).toBeGreaterThan(500);
    // PDF files start with the "%PDF" magic bytes.
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe("%PDF");
  });
});
