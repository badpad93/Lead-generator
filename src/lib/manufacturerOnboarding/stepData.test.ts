import { describe, expect, it } from "vitest";
import {
  filterTopLevelKeys,
  filterStepDataKeys,
  ALLOWED_TOP_LEVEL_KEYS,
} from "./stepData";

describe("filterTopLevelKeys (supplier autosave allowlist)", () => {
  it("keeps legitimate wizard fields", () => {
    const out = filterTopLevelKeys({
      legal_company_name: "Acme Vending",
      primary_contact_email: "ops@acme.com",
      warranty_summary: "12mo parts + labor",
    });
    expect(out.legal_company_name).toBe("Acme Vending");
    expect(out.primary_contact_email).toBe("ops@acme.com");
    expect(out.warranty_summary).toBe("12mo parts + labor");
  });

  it("drops admin-only columns silently — supplier cannot self-approve", () => {
    const out = filterTopLevelKeys({
      legal_company_name: "Acme",
      status: "approved",              // supplier attempts self-approval
      approved_at: "2026-01-01",
      admin_notes: "secretly great",
      reviewed_by: "some-admin-uuid",
      status_reason: "override",
      current_agreement_version: "0.0-forged",
    });
    expect(out).not.toHaveProperty("status");
    expect(out).not.toHaveProperty("approved_at");
    expect(out).not.toHaveProperty("admin_notes");
    expect(out).not.toHaveProperty("reviewed_by");
    expect(out).not.toHaveProperty("status_reason");
    expect(out).not.toHaveProperty("current_agreement_version");
    expect(out.legal_company_name).toBe("Acme");
  });

  it("drops random keys not in the allowlist", () => {
    const out = filterTopLevelKeys({ foo: "bar", legal_company_name: "OK" });
    expect(out).not.toHaveProperty("foo");
    expect(out.legal_company_name).toBe("OK");
  });

  it("ALLOWED_TOP_LEVEL_KEYS never includes admin-only columns", () => {
    const forbidden = [
      "status",
      "status_reason",
      "reviewed_by",
      "admin_notes",
      "approved_at",
      "current_agreement_version",
      "dwolla_customer_id",
      "dwolla_funding_source_url",
      "payout_status",
      "id",
    ];
    for (const key of forbidden) {
      expect(ALLOWED_TOP_LEVEL_KEYS.has(key)).toBe(false);
    }
  });
});

describe("filterStepDataKeys", () => {
  it("keeps allowed step_data scratchpad keys", () => {
    const out = filterStepDataKeys({ notes_for_review: "read pricing carefully", step_1_complete: true });
    expect(out.notes_for_review).toBe("read pricing carefully");
    expect(out.step_1_complete).toBe(true);
  });

  it("drops anything not on the step_data allowlist", () => {
    const out = filterStepDataKeys({
      notes_for_review: "ok",
      ssn: "123-45-6789",                 // classic PII
      account_number: "12345678",         // banking
      admin_override: true,
    });
    expect(out).not.toHaveProperty("ssn");
    expect(out).not.toHaveProperty("account_number");
    expect(out).not.toHaveProperty("admin_override");
    expect(out.notes_for_review).toBe("ok");
  });
});
