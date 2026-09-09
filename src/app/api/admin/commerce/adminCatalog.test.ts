import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseStub, type StubStore } from "@/lib/assistant/__testutils__/supabaseStub";
import { createFakeQbo } from "@/lib/commerce/__testutils__/fakeQbo";

/**
 * Administrator catalog interface: readiness report, read-only QuickBooks
 * Item lookup (production only, explicit request), and confirmed mapping
 * writes that touch Supabase only and leave an audit entry.
 */
const store: StubStore = {};
const stub = createSupabaseStub(store, []);
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));
const admin = { id: null as string | null };
vi.mock("@/lib/adminAuth", () => ({ getAdminUserId: async () => admin.id, isAdminByEmail: async () => false }));
const qbo = createFakeQbo();
const guard = { production: true };
vi.mock("@/lib/quickbooks", () => ({ qbApi: (p: string, o?: RequestInit) => qbo.api(p, o), isQbProduction: () => guard.production }));

import { GET as readiness } from "./catalog-readiness/route";
import { POST as listItems } from "./qbo-items/route";
import { POST as mapping } from "./catalog-mapping/route";

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const WEB = "c0000000-0000-4000-8000-00000000000c";
const req = (path: string, body?: unknown) => new NextRequest(`http://localhost${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const savedEnv = process.env.VERCEL_ENV;

beforeEach(() => {
  process.env.VERCEL_ENV = "production";
  guard.production = true;
  admin.id = ADMIN;
  qbo.reset();
  for (const k of Object.keys(store)) delete store[k];
  store.audit_logs = [];
  store.catalog_items = [{ id: WEB, catalog_key: "website-creation", name: "Website Creation", description: null, item_type: "other", unit_price: "500", sku: "WS0001", active: true, commerce_kind: "direct_checkout", pricing_basis: "fixed_unit", tax_treatment: "unset", required_agreement: null, qualification_program: null, financing_program: null, add_on_parent_key: null, equipment_ownership: null, qb_item_id: null }];
  qbo.items = [{ Id: "901", Name: "Website Creation", Sku: "WS0001", Active: true, Type: "Service", Taxable: true }];
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = savedEnv;
});

describe("administrator gate", () => {
  it("every route answers 403 to non-administrators and touches nothing", async () => {
    admin.id = null;
    expect((await readiness(req("/api/admin/commerce/catalog-readiness"))).status).toBe(403);
    expect((await listItems(req("/api/admin/commerce/qbo-items", { request: "list_items" }))).status).toBe(403);
    expect((await mapping(req("/api/admin/commerce/catalog-mapping", { catalog_key: "website-creation", qb_item_id: "901", tax_treatment: "qbo_automated", confirm: true }))).status).toBe(403);
    expect(qbo.requests).toHaveLength(0);
    expect(store.audit_logs).toHaveLength(0);
    expect(store.catalog_items[0].qb_item_id).toBeNull();
  });
});

describe("readiness report", () => {
  it("covers all twelve records with mapping and tax presence", async () => {
    const res = await readiness(req("/api/admin/commerce/catalog-readiness"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows).toHaveLength(12);
    expect(json.rows.find((r: { catalog_key: string }) => r.catalog_key === "website-creation")).toMatchObject({ exists: true, qb_mapping_present: false, tax_treatment_present: false, ready: false, actual_price: 500, approved_price: 500 });
    expect(json.quickbooks_lookup.available).toBe(true);
    expect(qbo.requests).toHaveLength(0);
  });
});

describe("QuickBooks Item lookup", () => {
  it("requires the explicit request body, reads only, and returns unconfirmed suggestions", async () => {
    expect((await listItems(req("/api/admin/commerce/qbo-items", {}))).status).toBe(422);
    expect(qbo.requests).toHaveLength(0);
    const res = await listItems(req("/api/admin/commerce/qbo-items", { request: "list_items" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toEqual([{ id: "901", name: "Website Creation", sku: "WS0001", active: true, type: "Service", taxable: true, sales_tax_code: null }]);
    expect(json.suggestions).toEqual([{ catalog_key: "website-creation", qb_item_id: "901", qb_item_name: "Website Creation", basis: "exact_sku" }]);
    expect(qbo.writes()).toHaveLength(0);
    expect(store.catalog_items[0].qb_item_id).toBeNull();
  });
  it("outside Production answers 503 without constructing the adapter, even for an administrator", async () => {
    for (const value of ["preview", "development", undefined]) {
      if (value === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = value;
      const res = await listItems(req("/api/admin/commerce/qbo-items", { request: "list_items" }));
      expect(res.status).toBe(503);
      expect((await res.json()).available).toBe(false);
    }
    process.env.VERCEL_ENV = "production";
    guard.production = false;
    expect((await listItems(req("/api/admin/commerce/qbo-items", { request: "list_items" }))).status).toBe(503);
    expect(qbo.requests).toHaveLength(0);
    const rep = await (await readiness(req("/api/admin/commerce/catalog-readiness"))).json();
    expect(rep.quickbooks_lookup.available).toBe(false);
  });
});

describe("mapping writes", () => {
  const body = (extra: Record<string, unknown>) => ({ catalog_key: "website-creation", qb_item_id: "901", qb_item_name: "Website Creation", tax_treatment: "qbo_automated", reason: "matched by SKU", confirm: true, ...extra });
  it("requires explicit confirmation", async () => {
    expect((await mapping(req("/api/admin/commerce/catalog-mapping", body({ confirm: false })))).status).toBe(422);
    const missing = { ...body({}) } as Record<string, unknown>;
    delete missing.confirm;
    expect((await mapping(req("/api/admin/commerce/catalog-mapping", missing))).status).toBe(422);
    expect(store.catalog_items[0].qb_item_id).toBeNull();
    expect(store.audit_logs).toHaveLength(0);
  });
  it("writes the mapping and tax treatment to Supabase only, records an audit entry, and never calls QuickBooks", async () => {
    const res = await mapping(req("/api/admin/commerce/catalog-mapping", body({})));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.row).toMatchObject({ catalog_key: "website-creation", qb_mapping_present: true, tax_treatment_present: true, ready: true });
    expect(store.catalog_items[0]).toMatchObject({ qb_item_id: "901", tax_treatment: "qbo_automated" });
    expect(store.audit_logs).toHaveLength(1);
    expect(store.audit_logs[0]).toMatchObject({ actor_id: ADMIN, action: "commerce.catalog_mapping_updated", entity_type: "catalog_item", entity_id: WEB, before: { qb_item_id: null, tax_treatment: "unset" }, after: { qb_item_id: "901", tax_treatment: "qbo_automated" }, reason: "matched by SKU" });
    expect(qbo.requests).toHaveLength(0);
    expect(json.audit_id).toBe(store.audit_logs[0].id);
  });
  it("rejects malformed ids, unknown keys, unknown tax treatments, and extra fields", async () => {
    expect((await mapping(req("/api/admin/commerce/catalog-mapping", body({ qb_item_id: "abc" })))).status).toBe(422);
    expect((await mapping(req("/api/admin/commerce/catalog-mapping", body({ catalog_key: "not-a-key" })))).status).toBe(404);
    expect((await mapping(req("/api/admin/commerce/catalog-mapping", body({ tax_treatment: "none" })))).status).toBe(422);
    expect((await mapping(req("/api/admin/commerce/catalog-mapping", body({ unit_price: 1 })))).status).toBe(422);
    expect(store.audit_logs).toHaveLength(0);
  });
  it("can clear a mapping (sets the row not-ready again) with an audit trail", async () => {
    await mapping(req("/api/admin/commerce/catalog-mapping", body({})));
    const res = await mapping(req("/api/admin/commerce/catalog-mapping", body({ qb_item_id: null, tax_treatment: "unset", reason: "wrong item" })));
    expect(res.status).toBe(200);
    expect((await res.json()).row.ready).toBe(false);
    expect(store.audit_logs).toHaveLength(2);
    expect(store.audit_logs[1].before).toEqual({ qb_item_id: "901", tax_treatment: "qbo_automated" });
  });
});
