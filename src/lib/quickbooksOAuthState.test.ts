import { describe, it, expect } from "vitest";
import { mintOAuthState, verifyOAuthState, QB_OAUTH_STATE_TTL_MS } from "./quickbooksOAuthState";

const env = { QB_CLIENT_SECRET: "test-secret" };

describe("QuickBooks OAuth state", () => {
  it("round-trips a signed state bound to the admin", () => {
    const s = mintOAuthState("admin-1", 1_000, env);
    expect(verifyOAuthState(s, s, 2_000, env)?.adminUserId).toBe("admin-1");
  });
  it("rejects a missing or mismatched cookie copy (CSRF)", () => {
    const a = mintOAuthState("admin-1", 1_000, env);
    const b = mintOAuthState("admin-1", 1_000, env);
    expect(verifyOAuthState(a, null, 2_000, env)).toBeNull();
    expect(verifyOAuthState(a, b, 2_000, env)).toBeNull();
    expect(verifyOAuthState(null, a, 2_000, env)).toBeNull();
  });
  it("rejects tampering, a foreign secret, expiry, and garbage", () => {
    const s = mintOAuthState("admin-1", 1_000, env);
    const [payload, sig] = s.split(".");
    const forged = `${Buffer.from(JSON.stringify({ adminUserId: "attacker", expiresAt: 9e12, nonce: "n" })).toString("base64url")}.${sig}`;
    expect(verifyOAuthState(forged, forged, 2_000, env)).toBeNull();
    expect(verifyOAuthState(`${payload}.AAAA`, `${payload}.AAAA`, 2_000, env)).toBeNull();
    expect(verifyOAuthState(s, s, 2_000, { QB_CLIENT_SECRET: "other" })).toBeNull();
    expect(verifyOAuthState(s, s, 1_000 + QB_OAUTH_STATE_TTL_MS + 1, env)).toBeNull();
    expect(verifyOAuthState("nodot", "nodot", 2_000, env)).toBeNull();
  });
});
