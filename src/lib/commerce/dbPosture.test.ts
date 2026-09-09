import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Independent verification of the grants and RLS posture declared by the
 * Phase 2 migrations, statement by statement:
 *   anon           no access to catalog_items or the commerce tables
 *   authenticated  SELECT own quotes/lines/inquiries only; no INSERT/UPDATE/DELETE
 *   service_role   full access via policy
 *   sequence       no anon/authenticated access
 * Every retained authenticated policy carries an explicit auth.uid() predicate.
 */
const dir = join(process.cwd(), "supabase", "migrations");
const catalog = readFileSync(join(dir, "20260907221651_catalog_items_commerce_metadata.sql"), "utf8");
const quotes = readFileSync(join(dir, "20260907221654_commerce_quotes.sql"), "utf8");
const rollout = readFileSync(join(dir, "20260908001754_assistant_checkout_rollout_flag.sql"), "utf8");
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");
const statements = (sql: string) => strip(sql).split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const policies = (sql: string) => statements(sql).filter((s) => /^CREATE POLICY/i.test(s));

describe("catalog_items posture", () => {
  it("enables RLS, revokes anon and authenticated, and grants only service_role through a policy", () => {
    const st = statements(catalog);
    expect(st).toContain("ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY");
    expect(st).toContain("REVOKE ALL ON TABLE public.catalog_items FROM anon");
    expect(st).toContain("REVOKE ALL ON TABLE public.catalog_items FROM authenticated");
    expect(st.some((s) => /^GRANT .* TO (anon|authenticated)/i.test(s))).toBe(false);
    const pol = policies(catalog);
    expect(pol).toHaveLength(1);
    expect(pol[0]).toMatch(/TO service_role/);
    expect(pol[0]).not.toMatch(/TO (anon|authenticated)/);
  });
});

describe("commerce tables posture", () => {
  const TABLES = ["commerce_quotes", "commerce_quote_lines", "commerce_listing_inquiries"];
  it("revokes everything from anon and authenticated, then grants authenticated SELECT only", () => {
    const st = statements(quotes);
    const list = TABLES.map((t) => `public.${t}`).join(", ");
    expect(st).toContain(`REVOKE ALL PRIVILEGES ON TABLE ${list} FROM anon`);
    expect(st).toContain(`REVOKE ALL PRIVILEGES ON TABLE ${list} FROM authenticated`);
    expect(st).toContain(`GRANT SELECT ON TABLE ${list} TO authenticated`);
    const grants = st.filter((s) => /^GRANT/i.test(s));
    expect(grants).toHaveLength(1);
    expect(grants[0]).not.toMatch(/INSERT|UPDATE|DELETE|ALL/i);
    expect(st.some((s) => /^GRANT/i.test(s) && /TO anon\b/i.test(s))).toBe(false);
  });
  it("enables RLS on all three tables with a service_role policy and an auth.uid()-scoped SELECT policy each", () => {
    const st = statements(quotes);
    for (const t of TABLES) expect(st).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    const pol = policies(quotes);
    expect(pol).toHaveLength(6);
    for (const t of TABLES) {
      const own = pol.filter((p) => p.includes(`ON public.${t} `));
      expect(own, t).toHaveLength(2);
      const service = own.find((p) => /TO service_role/.test(p))!;
      expect(service).toMatch(/FOR ALL/);
      const authenticated = own.find((p) => /TO authenticated/.test(p))!;
      expect(authenticated).toMatch(/FOR SELECT/);
      expect(authenticated).toMatch(/auth\.uid\(\)/);
      expect(authenticated).not.toMatch(/FOR (ALL|INSERT|UPDATE|DELETE)/);
      expect(authenticated).not.toMatch(/USING \(true\)/i);
    }
    expect(pol.filter((p) => /TO anon/.test(p))).toHaveLength(0);
  });
  it("keeps the quote-number sequence away from anon and authenticated", () => {
    expect(statements(quotes)).toContain("REVOKE ALL ON SEQUENCE public.commerce_quote_number_seq FROM anon, authenticated");
  });
  it("the ownership predicates name the owning column", () => {
    const pol = policies(quotes);
    expect(pol.find((p) => p.includes("commerce_quotes_owner_select"))).toMatch(/auth\.uid\(\) = user_id/);
    expect(pol.find((p) => p.includes("commerce_listing_inquiries_owner_select"))).toMatch(/auth\.uid\(\) = user_id/);
    expect(pol.find((p) => p.includes("commerce_quote_lines_owner_select"))).toMatch(/q\.user_id = auth\.uid\(\)/);
  });
});

describe("rollout flag migration", () => {
  it("seeds assistant.checkout_public_enabled false and adds only the reconciliation timestamp; no grants or policies change", () => {
    const st = statements(rollout);
    expect(rollout).toMatch(/\('assistant\.checkout_public_enabled', false,/);
    expect(rollout).toContain("ON CONFLICT (key) DO NOTHING");
    expect(st).toContain("ALTER TABLE public.commerce_quotes ADD COLUMN IF NOT EXISTS status_reconciled_at timestamptz");
    expect(st.some((s) => /^(GRANT|REVOKE|CREATE POLICY|ALTER POLICY|DROP POLICY)/i.test(s))).toBe(false);
    expect(rollout).not.toMatch(/'assistant\.[a-z_]+', true/);
  });
  it("every assistant flag ever seeded is seeded false", () => {
    const foundation = readFileSync(join(dir, "187_assistant_foundation.sql"), "utf8");
    for (const sql of [foundation, rollout]) {
      for (const m of sql.matchAll(/\('assistant\.[a-z_]+',\s*(true|false)/g)) expect(m[1]).toBe("false");
    }
  });
});
