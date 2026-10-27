import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validHours, weeklyAmountCents, HOURS_MIN, HOURS_STEP, HOURS_MAX } from "./locationServicesMath";

/*
 * Location Services: hire a locator on a recurring weekly plan. Math is unit
 * tested directly; the rest are source-level guards (routes import the
 * Supabase env).
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("weekly hours rules (multiples of 5, min 15, max 40)", () => {
  it("accepts 15, 20, 25 … 40", () => {
    for (const h of [15, 20, 25, 30, 35, 40]) expect(validHours(h)).toBe(true);
  });
  it("rejects below 15, non-multiples of 5, above 40, and non-integers", () => {
    for (const h of [0, 5, 10, 14, 17, 45, 12.5, "15", null, undefined]) expect(validHours(h as unknown)).toBe(false);
  });
  it("constants are 15 / 5 / 40", () => {
    expect([HOURS_MIN, HOURS_STEP, HOURS_MAX]).toEqual([15, 5, 40]);
  });
});

describe("weekly amount = hourly x hours", () => {
  it("multiplies cents by hours", () => {
    expect(weeklyAmountCents(5000, 15)).toBe(75000); // $50/hr x 15 = $750
    expect(weeklyAmountCents(7500, 20)).toBe(150000); // $75/hr x 20 = $1500
  });
});

describe("schema + routes", () => {
  it("migration creates locators + subscriptions and a headshot bucket", () => {
    const sql = read("supabase/migrations/20261029000000_location_services.sql");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.location_service_locators");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.location_service_subscriptions");
    expect(sql).toContain("hourly_rate_cents");
    expect(sql).toContain("next_bill_at");
    expect(sql).toContain("'location-service-locators', 'location-service-locators', true");
  });
  it("checkout is guest (no account provisioning) and charges the first week", () => {
    const route = read("src/app/api/location-services/[id]/checkout/route.ts");
    expect(route).toContain("getUserIdFromRequest");
    expect(route).not.toContain("provisionAccountForGuestCheckout");
    expect(route).toContain("validHours");
    expect(route).toContain("billWeek");
  });
  it("the recurring sweep checks prior-invoice payment and cancels unpaid weeks", () => {
    const lib = read("src/lib/locationServicesBilling.ts");
    expect(lib).toContain("priorInvoicePaid");
    expect(lib).toContain("cancelForNonpayment");
    expect(lib).toContain("Balance");
    const email = read("src/lib/locationServicesEmail.ts");
    expect(email).toContain("sendLocationServiceCancellation");
  });
  it("the cron is CRON_SECRET gated", () => {
    const cron = read("src/app/api/cron/location-services-sweep/route.ts");
    expect(cron).toContain("CRON_SECRET");
    expect(read("vercel.json")).toContain("/api/cron/location-services-sweep");
  });
});

describe("admin + public surfaces", () => {
  for (const rel of [
    "src/app/api/admin/location-services/locators/route.ts",
    "src/app/api/admin/location-services/locators/[id]/route.ts",
    "src/app/api/admin/location-services/subscriptions/route.ts",
  ]) {
    it(`${rel} is admin-gated`, () => {
      const src = read(rel);
      expect(src).toContain("getAdminUserId");
      expect(src).toContain("{ status: 403 }");
    });
  }
  it("admin page wires the Locators tab", () => {
    const src = read("src/app/admin/page.tsx");
    expect(src).toContain('import LocationServicesManager from "./LocationServicesManager"');
    expect(src).toContain('activeTab === "location_services"');
    expect(src).toContain('label: "Locators"');
  });
  it("the public /locators page + checkout exist and are middleware-public", () => {
    expect(read("src/app/locators/page.tsx")).toContain("getPublicLocators");
    expect(read("src/app/locators/[id]/checkout/CheckoutForm.tsx")).toContain("/api/location-services/");
    expect(read("src/proxy.ts")).toContain('"/locators"');
  });
});
