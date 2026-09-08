import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Existing customer payment paths are isolated from Vinnie. Two proofs:
 *  1. Structural: no existing QuickBooks payment file imports anything
 *     under src/lib/commerce or src/lib/assistant, and the Vinnie adapter
 *     is imported only by its allowlisted callers.
 *  2. Byte equality with the pre-Phase-2 baseline commit (the last main
 *     commit before any Vinnie work, 78ebc7e) for every existing payment
 *     file, when that commit is available locally (full clones and review
 *     environments; shallow CI checkouts run the structural proofs only).
 *     A fixed baseline is used deliberately: main itself briefly carried
 *     the pre-correction Phase 2 changes, so "equal to main" is not the
 *     property that matters; "equal to what customers were paying through
 *     before Phase 2" is.
 */
const ROOT = process.cwd();
export const PRE_PHASE2_BASELINE = "78ebc7e7657a675d5f4fcf2de80b9a01cc7b1ede";
export const EXISTING_PAYMENT_FILES = [
  "src/lib/quickbooks.ts",
  "src/lib/coffeeInvoiceRetry.ts",
  "src/lib/leadGeneratorSubscription.ts",
  "src/app/api/quickbooks/oauth/route.ts",
  "src/app/api/quickbooks/oauth/callback/route.ts",
  "src/app/api/webhooks/quickbooks/route.ts",
  "src/app/api/coffee/checkout/route.ts",
  "src/app/api/coffee/guest-checkout/route.ts",
  "src/app/api/coffee/orders/[id]/invoice/route.ts",
  "src/app/api/machine-listings/[id]/checkout/route.ts",
  "src/app/api/user-listings/[id]/checkout/route.ts",
  "src/app/api/agreements/token/[token]/checkout/route.ts",
  "src/app/api/account/workflows/[id]/pay-balance/route.ts",
  "src/app/api/checkout/route.ts",
  "src/app/api/request-location/route.ts",
];
const ADAPTER_IMPORTERS_ALLOWED = new Set([
  "src/lib/commerce/checkout.ts",
  "src/lib/commerce/checkoutAccess.ts",
  "src/lib/commerce/catalogReadiness.ts",
  "src/app/api/admin/commerce/catalog-readiness/route.ts",
  "src/app/api/admin/commerce/qbo-items/route.ts",
  "src/app/admin/commerce/catalog/page.tsx",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function baselineAvailable(): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${PRE_PHASE2_BASELINE}^{commit}`], { cwd: ROOT, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

describe("existing payment routes are isolated from Vinnie", () => {
  it("no existing QuickBooks payment file imports Vinnie commerce or assistant code", () => {
    for (const f of EXISTING_PAYMENT_FILES) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(src, f).not.toMatch(/from ["']@\/lib\/commerce\//);
      expect(src, f).not.toMatch(/from ["']@\/lib\/assistant\//);
      expect(src, f).not.toMatch(/quickbooksAdapter/);
    }
  });

  it("the Vinnie adapter is imported only by its allowlisted callers, none of them customer payment routes", () => {
    const importers = walk(join(ROOT, "src"))
      .filter((p) => /quickbooksAdapter["']/.test(readFileSync(p, "utf8")))
      .map((p) => p.slice(ROOT.length + 1))
      .filter((p) => p !== "src/lib/commerce/quickbooksAdapter.ts");
    for (const p of importers) expect(ADAPTER_IMPORTERS_ALLOWED.has(p), `unexpected adapter importer: ${p}`).toBe(true);
    expect(importers.length).toBeGreaterThan(0);
  });

  it("the shared QuickBooks module carries no Vinnie-specific code", () => {
    const src = readFileSync(join(ROOT, "src/lib/quickbooks.ts"), "utf8");
    expect(src).not.toMatch(/vinnie|commerce_quotes|ItemRef|getInvoiceWithLink|isTrustedInvoiceLink|timingSafeEqual/i);
  });

  it("every existing payment file is byte-identical to the pre-Phase-2 baseline", () => {
    if (!baselineAvailable()) {
      console.warn("pre-Phase-2 baseline commit is not available locally (shallow clone); byte-equality proof skipped, structural proofs above still ran.");
      return;
    }
    for (const f of EXISTING_PAYMENT_FILES) {
      const diff = execFileSync("git", ["diff", "--stat", PRE_PHASE2_BASELINE, "--", f], { cwd: ROOT, encoding: "utf8" });
      expect(diff, `${f} differs from the pre-Phase-2 baseline`).toBe("");
    }
    for (const removed of ["src/lib/quickbooksOAuthState.ts", "src/app/api/quickbooks/oauthCallback.test.ts"]) {
      expect(() => statSync(join(ROOT, removed)), `${removed} should not exist`).toThrow();
    }
  });
});
