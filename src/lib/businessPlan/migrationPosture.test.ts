import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Static posture check for the business-plan migration: next version,
 * forward-only, no anon or PUBLIC privileges, authenticated SELECT only
 * behind an auth.uid() policy, service-role policy preserved, no
 * price/cost/QuickBooks/sensitive columns, no flag changes.
 */
const DIR = join(process.cwd(), "supabase", "migrations");
const FILE = "20260910000000_commerce_business_plans.sql";
const sql = readFileSync(join(DIR, FILE), "utf8");
const strip = (s: string) => s.replace(/--[^\n]*/g, "");
const statements = strip(sql).split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const policies = statements.filter((s) => /^CREATE POLICY/i.test(s));

describe("migration 20260910000000 — commerce_business_plans", () => {
  it("is the newest timestamped migration and does not collide", () => {
    const files = readdirSync(DIR).filter((f) => /^\d{14}_/.test(f)).sort();
    expect(files[files.length - 1]).toBe(FILE);
    expect(files.filter((f) => f.startsWith("20260910000000"))).toEqual([FILE]);
  });
  it("is forward-only and idempotent: creates one table and one sequence, drops nothing but its own policies/trigger", () => {
    expect(statements.filter((s) => /^CREATE TABLE IF NOT EXISTS/i.test(s))).toHaveLength(1);
    expect(statements.filter((s) => /^CREATE SEQUENCE IF NOT EXISTS/i.test(s))).toHaveLength(1);
    expect(statements.some((s) => /^DROP TABLE|^ALTER TABLE public\.(commerce_quotes|catalog_items|assistant_|financing_applications|profiles)/i.test(s))).toBe(false);
    expect(statements.filter((s) => /^DROP /i.test(s)).every((s) => /^DROP (POLICY|TRIGGER) IF EXISTS \S+ ON public\.commerce_business_plans/i.test(s))).toBe(true);
    expect(sql).not.toMatch(/INSERT INTO|storefront_flags|assistant\./);
  });
  it("revokes everything from anon and authenticated, grants authenticated SELECT only, never PUBLIC, keeps the sequence private", () => {
    expect(statements).toContain("REVOKE ALL PRIVILEGES ON TABLE public.commerce_business_plans FROM anon");
    expect(statements).toContain("REVOKE ALL PRIVILEGES ON TABLE public.commerce_business_plans FROM authenticated");
    expect(statements).toContain("GRANT SELECT ON TABLE public.commerce_business_plans TO authenticated");
    expect(statements).toContain("REVOKE ALL ON SEQUENCE public.commerce_business_plan_number_seq FROM anon, authenticated");
    const grants = statements.filter((s) => /^GRANT/i.test(s));
    expect(grants).toHaveLength(1);
    expect(grants[0]).not.toMatch(/INSERT|UPDATE|DELETE|ALL/i);
    expect(sql).not.toMatch(/\b(TO|FROM)\s+public\s*;/i);
    expect(statements.some((s) => /^GRANT/i.test(s) && /TO anon\b/i.test(s))).toBe(false);
  });
  it("enables RLS with a service_role policy and an auth.uid()-scoped SELECT policy, and no anon or JWT-claim policy", () => {
    expect(statements).toContain("ALTER TABLE public.commerce_business_plans ENABLE ROW LEVEL SECURITY");
    expect(policies).toHaveLength(2);
    const service = policies.find((p) => /TO service_role/.test(p))!;
    expect(service).toMatch(/FOR ALL/);
    const owner = policies.find((p) => /TO authenticated/.test(p))!;
    expect(owner).toMatch(/FOR SELECT/);
    expect(owner).toMatch(/auth\.uid\(\) = user_id/);
    expect(owner).not.toMatch(/FOR (ALL|INSERT|UPDATE|DELETE)|USING \(true\)|jwt|claims/i);
    expect(policies.some((p) => /TO anon/.test(p))).toBe(false);
  });
  it("stores references and JSON only: no price, cost, commission, margin, QuickBooks, credential, or sensitive financing column", () => {
    const table = sql.slice(sql.indexOf("CREATE TABLE"), sql.indexOf("COMMENT ON TABLE"));
    expect(table).not.toMatch(/price|cost|commission|margin|qb_|quickbooks|checkout_url|credit|income|ssn|date_of_birth|bank|card/i);
    for (const col of ["user_id uuid NOT NULL REFERENCES public.profiles(id)", "quote_id uuid REFERENCES public.commerce_quotes(id)", "financing_application_id uuid REFERENCES public.financing_applications(id)", "engine_version text NOT NULL", "inputs jsonb", "outputs jsonb", "catalog_snapshot jsonb"]) {
      expect(table.replace(/\s+/g, " ")).toContain(col);
    }
  });
});
