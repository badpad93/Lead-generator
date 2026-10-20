import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Smart Coolers admin-editable machine grid. The lib + routes import the
 * Supabase env, so these are source-level guards (no DB needed).
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("smart cooler machines migration", () => {
  const sql = read("supabase/migrations/20261015000000_smart_cooler_machines.sql");
  it("creates the table with a public-read policy and no client write policy", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.smart_cooler_machines");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FOR SELECT USING (true)");
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)\b/);
  });
  it("creates a public storage bucket and seeds the eight machines", () => {
    expect(sql).toContain("'smart-cooler-machines', 'smart-cooler-machines', true");
    expect(sql).toContain("INSERT INTO public.smart_cooler_machines");
    expect((sql.match(/Smart Cooler'|Smart Store'|Smart Cooler\b/g) || []).length).toBeGreaterThanOrEqual(7);
  });
});

describe("admin routes are admin-gated and write via the service role", () => {
  for (const rel of [
    "src/app/api/admin/smart-coolers/machines/route.ts",
    "src/app/api/admin/smart-coolers/machines/[id]/route.ts",
    "src/app/api/admin/smart-coolers/machines/[id]/photo/route.ts",
  ]) {
    it(`${rel} checks getAdminUserId and uses supabaseAdmin`, () => {
      const src = read(rel);
      expect(src).toContain("getAdminUserId");
      expect(src).toContain("{ status: 403 }");
      expect(src).toContain("supabaseAdmin");
    });
  }
  it("the photo route validates MIME and size", () => {
    const src = read("src/app/api/admin/smart-coolers/machines/[id]/photo/route.ts");
    expect(src).toContain("MACHINE_ALLOWED_MIME");
    expect(src).toContain("status: 415");
    expect(src).toContain("status: 413");
  });
});

describe("public page is DB-driven with a safe fallback", () => {
  it("reads machines from the lib instead of a hardcoded array", () => {
    const src = read("src/app/smart-coolers/page.tsx");
    expect(src).toContain("getSmartCoolerMachines");
    expect(src).not.toContain("const MACHINES");
  });
  it("the lib falls back to the shipped list when the DB is unavailable", () => {
    const src = read("src/lib/smartCoolerMachines.ts");
    expect(src).toContain("FALLBACK_MACHINES");
    expect(src).toContain('.eq("active", true)');
  });
});

describe("admin panel exposes a Smart Coolers tab", () => {
  const src = read("src/app/admin/page.tsx");
  it("imports the manager and wires the tab", () => {
    expect(src).toContain('import SmartCoolersManager from "./SmartCoolersManager"');
    expect(src).toContain('activeTab === "smart_coolers"');
    expect(src).toContain('label: "Smart Coolers"');
  });
});
