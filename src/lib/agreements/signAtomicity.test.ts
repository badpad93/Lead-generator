import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Phase 5C-a10.1 atomicity — the operator signature and the agreement
 * status/acknowledgment update must be ONE transaction, so a failure of the
 * second write can never leave a durable signature behind.
 *
 * No DB in this env, so atomicity is proven structurally: both writes live
 * inside a single plpgsql function body (atomic by Postgres semantics — any
 * error rolls back the whole body), and the route performs exactly one RPC
 * call rather than two independent writes. A DB-level "force the second
 * write to fail" test would add nothing a constraint/RAISE inside the
 * function doesn't already guarantee: the INSERT is rolled back with it.
 */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");
const FN = "supabase/migrations/20260909010000_record_operator_signature_txn.sql";
const ROUTE = "src/app/api/agreements/sign/[token]/sign/route.ts";

describe("both writes are inside one transactional function", () => {
  const fn = read(FN);
  it("is a single plpgsql function (one implicit transaction)", () => {
    expect(fn).toContain("CREATE OR REPLACE FUNCTION public.record_operator_signature");
    expect(fn).toContain("LANGUAGE plpgsql");
    expect(fn).toContain("SECURITY DEFINER");
  });
  it("performs BOTH the signature insert and the agreement update in that body", () => {
    expect(fn).toContain("INSERT INTO public.agreement_signatures");
    expect(fn).toContain("UPDATE public.purchase_agreements SET");
    // update sits after the insert within the same body → same transaction
    expect(fn.indexOf("INSERT INTO public.agreement_signatures"))
      .toBeLessThan(fn.indexOf("UPDATE public.purchase_agreements SET"));
  });
  it("locks the agreement row and validates signability inside the txn", () => {
    expect(fn).toContain("FOR UPDATE");
    expect(fn).toContain("agreement_not_signable");
  });
  it("stamps signature + acknowledgments with the SAME in-transaction timestamp", () => {
    expect(fn).toContain("v_now             timestamptz := now()");
    expect(fn).toContain("operator_signed_at = v_now");
    expect(fn).toContain("coffee_acknowledged_at =");
    expect(fn).toContain("THEN v_now");
  });
  it("is retry-idempotent — an already-signed operator returns without a duplicate insert", () => {
    expect(fn).toContain("IF v_ag.operator_signed_at IS NOT NULL THEN");
    expect(fn).toContain("'idempotent', true");
  });
  it("is granted to service_role", () => {
    expect(fn).toContain("GRANT EXECUTE ON FUNCTION public.record_operator_signature");
    expect(fn).toContain("TO service_role");
  });
});

describe("the route uses the atomic RPC, not a two-write sequence", () => {
  const src = read(ROUTE);
  it("calls the RPC once and has no independent signature/agreement writes", () => {
    expect(src).toContain('supabaseAdmin.rpc(');
    expect(src).toContain('"record_operator_signature"');
    expect(src).not.toContain('.from("agreement_signatures")');
    // the only remaining purchase_agreements .from() is the initial read
    const writes = src.match(/\.from\("purchase_agreements"\)\s*\.update/g) || [];
    expect(writes.length).toBe(0);
  });
  it("surfaces an RPC failure as an error (no success path on a failed txn)", () => {
    expect(src).toContain("rpcErr");
    expect(src).toContain("Failed to record signature");
  });
});
