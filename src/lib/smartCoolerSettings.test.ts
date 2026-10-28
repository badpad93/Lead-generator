import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Admin-editable lead-time / estimated-delivery banner on the machine purchase
 * pages. Source-level guards (the lib + routes import the Supabase env).
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("smart cooler purchase banner", () => {
  it("migration creates the singleton settings table", () => {
    const sql = read("supabase/migrations/20261030000000_smart_cooler_settings.sql");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.smart_cooler_settings");
    expect(sql).toContain("purchase_banner_enabled");
    expect(sql).toContain("purchase_banner_message");
  });
  it("the admin settings route is admin-gated (GET + PATCH)", () => {
    const src = read("src/app/api/admin/smart-coolers/settings/route.ts");
    expect(src).toContain("getAdminUserId");
    expect(src).toContain("{ status: 403 }");
    expect(src).toContain("export async function PATCH");
    expect(src).toContain("updateSmartCoolerSettings");
  });
  it("the banner renders only when enabled + non-empty", () => {
    const src = read("src/app/components/MachinePurchaseBanner.tsx");
    expect(src).toContain("getSmartCoolerSettings");
    expect(src).toContain("s.bannerEnabled");
    expect(src).toContain("return null");
  });
  it("the banner shows on the purchase surfaces", () => {
    for (const rel of [
      "src/app/smart-coolers/page.tsx",
      "src/app/smart-coolers/[id]/checkout/page.tsx",
      "src/app/brands/[slug]/page.tsx",
    ]) {
      expect(read(rel), rel).toContain("MachinePurchaseBanner");
    }
  });
  it("the admin Smart Coolers tab exposes the banner editor", () => {
    const src = read("src/app/admin/SmartCoolersManager.tsx");
    expect(src).toContain("BannerSettings");
    expect(src).toContain("/api/admin/smart-coolers/settings");
  });
});
