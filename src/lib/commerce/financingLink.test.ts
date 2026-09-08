import { describe, it, expect } from "vitest";
import { financingReturnUrl, signQuoteRef, verifyQuoteRef } from "./financingLink";

const env = { ASSISTANT_HASH_SECRET: "s" };
const QID = "11111111-1111-4111-8111-000000000001";

describe("opaque financing quote reference", () => {
  it("round-trips and rejects tampering, foreign secrets, and malformed refs", () => {
    const ref = signQuoteRef(QID, env);
    expect(verifyQuoteRef(ref, env)).toBe(QID);
    expect(verifyQuoteRef(ref.slice(0, -1) + "x", env)).toBeNull();
    expect(verifyQuoteRef(ref, { ASSISTANT_HASH_SECRET: "other" })).toBeNull();
    expect(verifyQuoteRef(QID, env)).toBeNull();
    expect(verifyQuoteRef("", env)).toBeNull();
    expect(verifyQuoteRef(null, env)).toBeNull();
  });
  it("routes to the existing /financing flow and carries no financial data", () => {
    process.env.ASSISTANT_HASH_SECRET = "s";
    const url = financingReturnUrl(QID);
    expect(url.startsWith("/financing?quote=")).toBe(true);
    expect(url).not.toMatch(/ssn|income|credit|bank/i);
  });
});
