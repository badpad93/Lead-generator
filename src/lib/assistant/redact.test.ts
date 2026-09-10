import { describe, it, expect } from "vitest";
import { detectPrivateFinancingData, redactUserMessage, SENSITIVE_INPUT_NOTICE } from "./redact";

describe("redactUserMessage", () => {
  it("redacts a Luhn-valid card number and explains", () => {
    const r = redactUserMessage("my card is 4111 1111 1111 1111 thanks", 2000);
    expect(r.rejected).toBe(false);
    expect(r.text).toContain("[card number removed]");
    expect(r.text).not.toContain("4111");
    expect(r.redactions).toContain("card number");
    expect(r.notice).toBe(SENSITIVE_INPUT_NOTICE);
  });

  it("does not redact ordinary long numbers that fail Luhn (order numbers, quantities)", () => {
    const r = redactUserMessage("order VC-1725600000000 for 12 cases at $45.00, call 555-123-4567", 2000);
    expect(r.rejected).toBe(false);
    expect(r.text).toContain("VC-1725600000000");
    expect(r.text).toContain("$45.00");
    expect(r.text).toContain("555-123-4567");
    expect(r.redactions).toEqual([]);
  });

  it("redacts SSNs", () => {
    const r = redactUserMessage("ssn 123-45-6789", 2000);
    // Mentioning "ssn" is treated as private financing data and rejected outright.
    expect(r.rejected).toBe(true);
    const r2 = redactUserMessage("the number is 123-45-6789 ok", 2000);
    expect(r2.text).toContain("[SSN removed]");
    expect(r2.text).not.toContain("6789");
  });

  it("redacts routing and account numbers with context", () => {
    const r = redactUserMessage("routing 021000021 and account number 1234567890", 2000);
    expect(r.text).not.toContain("021000021");
    expect(r.text).not.toContain("1234567890");
    expect(r.redactions).toContain("bank account or routing number");
  });

  it("rejects volunteered private financing data without storing it", () => {
    for (const msg of ["My net worth is $400,000, can I get financing?", "our annual income is $250,000", "I filed for bankruptcy in 2019"]) {
      const r = redactUserMessage(msg, 2000);
      expect(r.rejected).toBe(true);
      expect(r.text).toBe("");
      expect(r.notice).toBe(SENSITIVE_INPUT_NOTICE);
    }
    expect(detectPrivateFinancingData("Which brewer is best for a small office?")).toBe(false);
  });

  it("enforces the length limit", () => {
    const r = redactUserMessage("x".repeat(201), 200);
    expect(r.rejected).toBe(true);
    expect(r.notice).toContain("200");
  });
});

describe("business-plan discovery answers", () => {
  it("accepts an income or cash-flow goal (a target) while still rejecting actual income", () => {
    expect(redactUserMessage("My income goal is $5,000 a month from the machines", 2000).rejected).toBe(false);
    expect(redactUserMessage("our monthly income target: $3,000", 2000).rejected).toBe(false);
    expect(redactUserMessage("I'd like about $3,000 a month in cash flow", 2000).rejected).toBe(false);
    expect(redactUserMessage("my income is $85,000", 2000).rejected).toBe(true);
    // A credit score is a planning input Vinnie may receive; actual income is not.
    expect(redactUserMessage("my credit score is 720", 2000).rejected).toBe(false);
    expect(redactUserMessage("FICO is 680", 2000).rejected).toBe(false);
    expect(redactUserMessage("I have 20 hours a week, a van, and about $8,000 in cash", 2000).rejected).toBe(false);
  });
});
