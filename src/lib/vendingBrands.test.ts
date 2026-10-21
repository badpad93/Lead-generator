import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * AI Vending Brands (phase 1: data + admin). The lib + routes import the
 * Supabase env, so these are source-level guards.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("vending brands migration", () => {
  const sql = read("supabase/migrations/20261022000000_vending_brands.sql");
  it("creates the brands table with public-read RLS and no write policy", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.vending_brands");
    expect(sql).toMatch(/slug\s+text NOT NULL UNIQUE/);
    expect(sql).toContain("FOR SELECT USING (true)");
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)\b/);
  });
  it("creates a public logo bucket and links machines + financing", () => {
    expect(sql).toContain("'vending-brand-logos', 'vending-brand-logos', true");
    expect(sql).toContain("ALTER TABLE public.machine_listings");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.vending_brands(id)");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS machine_listing_id uuid REFERENCES public.machine_listings(id)");
  });
});

describe("admin brand routes are admin-gated", () => {
  for (const rel of [
    "src/app/api/admin/vending-brands/route.ts",
    "src/app/api/admin/vending-brands/[id]/route.ts",
    "src/app/api/admin/vending-brands/[id]/logo/route.ts",
    "src/app/api/admin/vending-brands/machines/route.ts",
  ]) {
    it(`${rel} checks getAdminUserId`, () => {
      const src = read(rel);
      expect(src).toContain("getAdminUserId");
      expect(src).toContain("{ status: 403 }");
    });
  }
  it("logo upload validates MIME and size", () => {
    const src = read("src/app/api/admin/vending-brands/[id]/logo/route.ts");
    expect(src).toContain("BRAND_LOGO_ALLOWED_MIME");
    expect(src).toContain("status: 415");
    expect(src).toContain("status: 413");
  });
  it("machine assignment sets machine_listings.brand_id", () => {
    const src = read("src/app/api/admin/vending-brands/machines/route.ts");
    expect(src).toContain('.from("machine_listings")');
    expect(src).toContain("brand_id");
  });
});

describe("public brand pages (phase 2)", () => {
  it("the lib exposes a brand-lineup reader", () => {
    const src = read("src/lib/vendingBrands.ts");
    expect(src).toContain("export async function getBrandBySlug");
    expect(src).toContain('.eq("brand_id", brand.id)');
    expect(src).toContain('.eq("status", "active")');
  });
  it("the brand lineup page reads by slug and 404s when missing", () => {
    const src = read("src/app/brands/[slug]/page.tsx");
    expect(src).toContain("getBrandBySlug");
    expect(src).toContain("notFound()");
  });
  it("/smart-coolers renders the brands section", () => {
    const src = read("src/app/smart-coolers/page.tsx");
    expect(src).toContain("getPublicBrands");
    expect(src).toContain("BrandCard");
  });
  it("/brands is public in middleware", () => {
    const src = read("src/proxy.ts");
    expect(src).toContain('"/brands/"');
  });
});

describe("purchase + financing + machines-for-sale replacement (phase 3)", () => {
  it("brand cards offer Purchase (reusing checkout) and Financing", () => {
    const src = read("src/app/brands/[slug]/page.tsx");
    expect(src).toContain("/machines-for-sale/${machine.id}/checkout");
    expect(src).toContain("/financing?machine=${machine.id}");
    expect(src).toContain("machine.buyNowEnabled");
  });
  it("financing stores the machine_listing_id (validated UUID)", () => {
    const src = read("src/app/api/financing/route.ts");
    expect(src).toContain("machine_listing_id");
    expect(src).toContain("UUID_RE");
    const page = read("src/app/financing/page.tsx");
    expect(page).toContain('get("machine")');
    expect(page).toContain("machine_listing_id");
  });
  it("the machines-for-sale index redirects to the new storefront", () => {
    const src = read("src/app/machines-for-sale/page.tsx");
    expect(src).toContain('redirect("/smart-coolers")');
  });
});

describe("admin panel exposes an AI Brands tab", () => {
  const src = read("src/app/admin/page.tsx");
  it("imports the manager and wires the tab", () => {
    expect(src).toContain('import VendingBrandsManager from "./VendingBrandsManager"');
    expect(src).toContain('activeTab === "vending_brands"');
    expect(src).toContain('label: "AI Brands"');
  });
});
