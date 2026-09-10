import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseStub, type StubStore } from "@/lib/assistant/__testutils__/supabaseStub";
import { CATALOG } from "@/lib/businessPlan/__testutils__/catalogFixture";
import { ENGINE_VERSION } from "@/lib/businessPlan/assumptions";
import { buildPlanView, defaultInputs } from "@/lib/businessPlan/plan";

/**
 * GET /api/assistant/business-plan/[id]/export: owner only, three
 * formats, safe attachment filename, no caching, 404-as-disabled while
 * the assistant flag is off. Files are generated on the server from the
 * stored plan; nothing external is contacted.
 */
const store: StubStore = {};
const stub = createSupabaseStub(store);
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));
const flags = { enabled: true };
vi.mock("@/lib/assistant/flags", () => ({ isAssistantEnabled: async () => flags.enabled, isAssistantWriteToolsEnabled: async () => true, isAssistantCheckoutEnabled: async () => false, isAssistantCheckoutPublicEnabled: async () => false }));
const actor: { kind: "user" | "guest"; id: string } = { kind: "user", id: "" };
vi.mock("@/lib/assistant/actor", () => ({
  resolveActor: async () => (actor.kind === "user" ? { kind: "user", profile: { id: actor.id, full_name: "Jamie", role: "operator", coffee_access_enabled: false, storefront_tenant_id: null }, storefront: null } : { kind: "guest", token: "g" }),
}));

import { GET } from "./business-plan/[id]/export/route";

const U1 = "11111111-1111-4111-8111-000000000001";
const U2 = "11111111-1111-4111-8111-000000000002";
const PLAN = "0d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a11";
const get = (id: string, format: string | null) => GET(new NextRequest(`http://localhost/api/assistant/business-plan/${id}/export${format === null ? "" : `?format=${format}`}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  flags.enabled = true;
  actor.kind = "user";
  actor.id = U1;
  const inputs = defaultInputs();
  store.commerce_business_plans = [{ id: PLAN, user_id: U1, thread_id: null, plan_number: "VP-260910-0001", version: 2, engine_version: ENGINE_VERSION, status: "confirmed", package: "ten_ten_ten", website_included: true, website_decision: "default", inputs, catalog_snapshot: CATALOG, outputs: buildPlanView(inputs, CATALOG), quote_id: null, financing_status: "none", financing_application_id: null, created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z" }];
});

describe("business-plan export route", () => {
  it("serves each format to the owner as a no-store attachment with a plan-number filename", async () => {
    for (const [format, type, magic] of [["xlsx", "spreadsheetml.sheet", "PK"], ["docx", "wordprocessingml.document", "PK"], ["pdf", "application/pdf", "%PDF"]] as const) {
      const res = await get(PLAN, format);
      expect(res.status, format).toBe(200);
      expect(res.headers.get("content-type")).toContain(type);
      expect(res.headers.get("content-disposition")).toBe(`attachment; filename="VendingConnector-BusinessPlan-VP-260910-0001-v2.${format}"`);
      expect(res.headers.get("cache-control")).toBe("no-store, private");
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.subarray(0, magic.length).toString()).toBe(magic);
    }
  });
  it("refuses guests (401) and other customers (404) without revealing the plan", async () => {
    actor.kind = "guest";
    expect((await get(PLAN, "pdf")).status).toBe(401);
    actor.kind = "user";
    actor.id = U2;
    const res = await get(PLAN, "pdf");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("VP-260910");
  });
  it("rejects a bad id or format (422) and is indistinguishable from a missing route while the assistant is off", async () => {
    expect((await get(PLAN, "csv")).status).toBe(422);
    expect((await get(PLAN, null)).status).toBe(422);
    expect((await get("not-a-uuid", "pdf")).status).toBe(422);
    expect((await get("../etc/passwd", "pdf")).status).toBe(422);
    flags.enabled = false;
    expect((await get(PLAN, "pdf")).status).toBe(404);
  });
});
