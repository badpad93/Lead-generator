import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Static guard for migration 189: the assistant tables' privilege intent
 * must stay exactly as validated on the preview branch, and migration 187
 * must remain untouched.
 */
const DIR = join(process.cwd(), "supabase", "migrations");
const FILE = "189_assistant_privileges.sql";
const norm = (s: string) => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
const sql = norm(readFileSync(join(DIR, FILE), "utf8"));

const STATEMENTS = [
  "REVOKE ALL PRIVILEGES ON TABLE public.assistant_threads, public.assistant_messages, public.assistant_tool_runs FROM anon;",
  "REVOKE ALL PRIVILEGES ON TABLE public.assistant_threads, public.assistant_messages, public.assistant_tool_runs FROM authenticated;",
  "GRANT SELECT ON TABLE public.assistant_threads, public.assistant_messages TO authenticated;",
];

describe("migration 189 — assistant table privileges", () => {
  it("is the next sequential migration and does not collide", () => {
    const files = readdirSync(DIR);
    expect(files.filter((f) => f.startsWith("189"))).toEqual([FILE]);
    expect(files.some((f) => f.startsWith("188_"))).toBe(true);
  });

  it("contains exactly the three validated statements, in order, and nothing else", () => {
    expect(sql).toBe(STATEMENTS.join(" "));
  });

  it("never grants anon or PUBLIC anything, never touches service_role, policies, defaults, or other tables", () => {
    expect(sql).not.toMatch(/GRANT[^;]*\bTO\s+(anon|public)\s*;/i);
    expect(sql).not.toMatch(/\b(TO|FROM)\s+public\s*;/i);
    expect(sql).not.toMatch(/service_role/i);
    expect(sql).not.toMatch(/POLICY|DEFAULT PRIVILEGES|CREATE|ALTER|DROP|SCHEMA|FUNCTION|INSERT|UPDATE|DELETE/i);
    const tables = sql.match(/public\.\w+/g) ?? [];
    expect(new Set(tables)).toEqual(new Set(["public.assistant_threads", "public.assistant_messages", "public.assistant_tool_runs"]));
    expect(sql).not.toMatch(/GRANT[^;]*assistant_tool_runs/i);
  });

  it("leaves migration 187 as applied (its original REVOKEs are still present, unmodified)", () => {
    const m187 = readFileSync(join(DIR, "187_assistant_foundation.sql"), "utf8");
    for (const line of [
      "REVOKE INSERT, UPDATE, DELETE ON public.assistant_threads   FROM anon, authenticated;",
      "REVOKE INSERT, UPDATE, DELETE ON public.assistant_messages  FROM anon, authenticated;",
      "REVOKE ALL                     ON public.assistant_tool_runs FROM anon, authenticated;",
    ]) expect(m187).toContain(line);
    expect(m187).not.toContain("REVOKE ALL PRIVILEGES");
  });
});
