import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Source-level guards for the lead-owner customer-activity feature. The route
 * reads via the service role and must enforce own-customers-only scoping; the
 * lead page must surface the activity section. Asserted at the source level so
 * these tests need no DB/DOM.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("lead activity API route", () => {
  const src = read("src/app/api/sales/leads/[id]/activity/route.ts");
  it("authenticates as a sales user and enforces per-rep scoping", () => {
    expect(src).toContain("getSalesUser");
    expect(src).toContain("canRepSeeLead");
    expect(src).toContain('{ status: 403 }');
  });
  it("gathers orders, quotes, and agreements", () => {
    expect(src).toContain('.from("sales_orders")');
    expect(src).toContain('.from("commerce_quotes")');
    expect(src).toContain('.from("user_agreements")');
    expect(src).toContain('.from("location_agreements")');
  });
  it("links orders by lead, account, and email", () => {
    expect(src).toContain("lead_id.eq.");
    expect(src).toContain("account_id.eq.");
    expect(src).toContain("recipient_email.ilike.");
  });
});

describe("lead page surfaces the activity section", () => {
  const src = read("src/app/sales/leads/page.tsx");
  it("imports and renders LeadActivitySection in the edit modal", () => {
    expect(src).toContain('import LeadActivitySection from "./LeadActivitySection"');
    expect(src).toContain("<LeadActivitySection");
  });
});
