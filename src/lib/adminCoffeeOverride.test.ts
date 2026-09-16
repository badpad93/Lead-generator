import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Admin one-off override so an operator can order without signing the CURRENT
 * coffee_supply agreement. Reuses the audited grantLegacyApproval primitive;
 * asserted at the source level (the runtime helpers import the Supabase env).
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("grantLegacyApproval targets the right agreement type", () => {
  const src = read("src/lib/placementAgreements.ts");
  it("AdminOverrideArgs carries an agreementType", () => {
    expect(src).toContain("agreementType?: string");
  });
  it("uses getActiveTemplate(agreementType) — not the placement_provider default", () => {
    expect(src).toContain('const agreementType = args.agreementType ?? "placement_provider"');
    expect(src).toContain("getActiveTemplate(agreementType)");
  });
  it("still requires a reason and writes an admin_override_granted audit event", () => {
    expect(src).toContain("Override reason is required");
    expect(src).toContain('"admin_override_granted"');
    expect(src).toContain('status: "legacy_approved"');
  });
  it("the coffee ordering gate accepts legacy_approved", () => {
    expect(src).toContain('const ok: AgreementStatus[] = ["fully_executed", "legacy_approved"]');
  });
});

describe("admin override route", () => {
  const src = read("src/app/api/admin/coffee/agreements/[userId]/override/route.ts");
  it("is admin-gated", () => {
    expect(src).toContain("getAdminUserId(req)");
    expect(src).toContain("status: 403");
  });
  it("requires a reason (400) and calls grantLegacyApproval for coffee_supply", () => {
    expect(src).toContain("A reason for the override is required.");
    expect(src).toContain("grantLegacyApproval");
    expect(src).toContain('agreementType: "coffee_supply"');
    expect(src).toContain("adminUserId: adminId");
  });
});

describe("admin agreements page exposes the override", () => {
  const src = read("src/app/admin/coffee/agreements/page.tsx");
  it("has an 'Allow ordering' button wired to grantOrderOverride", () => {
    expect(src).toContain("grantOrderOverride");
    expect(src).toContain("Allow ordering");
    expect(src).toContain("/override");
  });
  it("prompts for a reason and posts it", () => {
    expect(src).toContain("prompt(");
    expect(src).toContain('body: JSON.stringify({ reason: reason.trim() })');
  });
  it("shows the override only when the operator is not already cleared", () => {
    expect(src).toContain('r.status === "fully_executed" || r.status === "legacy_approved"');
    expect(src).toContain("{!cleared ?");
  });
});
