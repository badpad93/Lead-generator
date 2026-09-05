import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { isCustomerShellRequest } from "@/lib/storefrontCtxCookie";

/**
 * Shell predicate tests — decides whether a request drops the global
 * Vending Connector chrome for the operator (customer shell) or keeps it.
 * Branding/shell only; never an authorization decision.
 */
function req(url: string, cookie?: string): NextRequest {
  return new NextRequest(`https://vendingconnector.com${url}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe("isCustomerShellRequest", () => {
  it("storefront pages always use the customer shell", () => {
    expect(isCustomerShellRequest(req("/coffee/o/abc-vending"))).toBe(true);
    expect(isCustomerShellRequest(req("/coffee/o/abc-vending/anything"))).toBe(true);
  });

  it("auth page + explicit ?storefront= uses the customer shell", () => {
    expect(isCustomerShellRequest(req("/login?storefront=abc-vending"))).toBe(true);
    expect(isCustomerShellRequest(req("/forgot-password?storefront=abc-vending"))).toBe(true);
  });

  it("auth page + vc_sf_ctx cookie uses the customer shell (bare /login returning customer)", () => {
    expect(isCustomerShellRequest(req("/login", "vc_sf_ctx=abc-vending"))).toBe(true);
    expect(isCustomerShellRequest(req("/reset-password", "vc_sf_ctx=abc-vending"))).toBe(true);
  });

  it("auth page + stashed invite token uses the customer shell", () => {
    expect(isCustomerShellRequest(req("/signup", "vc_storefront_invite_token=sometoken"))).toBe(true);
  });

  it("auth/callback with context uses the customer shell", () => {
    expect(isCustomerShellRequest(req("/auth/callback?flow=login&storefront=abc-vending"))).toBe(true);
    expect(isCustomerShellRequest(req("/auth/callback", "vc_sf_ctx=abc-vending"))).toBe(true);
  });

  it("auth page WITHOUT any storefront context keeps the normal VC shell", () => {
    expect(isCustomerShellRequest(req("/login"))).toBe(false);
    expect(isCustomerShellRequest(req("/signup"))).toBe(false);
    expect(isCustomerShellRequest(req("/auth/callback?flow=login"))).toBe(false);
  });

  it("an invalid/forged ?storefront= slug does not trigger the customer shell", () => {
    expect(isCustomerShellRequest(req("/login?storefront=../evil"))).toBe(false);
    expect(isCustomerShellRequest(req("/login", "vc_sf_ctx=Not A Slug!"))).toBe(false);
  });

  it("normal VC routes keep the global shell", () => {
    expect(isCustomerShellRequest(req("/"))).toBe(false);
    expect(isCustomerShellRequest(req("/marketplace"))).toBe(false);
    expect(isCustomerShellRequest(req("/dashboard"))).toBe(false);
    // A vc_sf_ctx cookie on a non-auth, non-storefront route must NOT
    // suppress the shell (only auth + storefront routes qualify).
    expect(isCustomerShellRequest(req("/dashboard", "vc_sf_ctx=abc-vending"))).toBe(false);
  });
});
