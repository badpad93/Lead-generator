import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Enrollment tests — cover:
 *   - issueInvitation stamps a token + audit row on approved tenants only
 *   - previewInvitationByToken reports state flags (expired / revoked / used)
 *   - consumeInvitation is one-shot (already-linked profile rejected)
 *   - consumeInvitation copies quoted_prices to storefront_customer_prices
 *   - transferCustomer moves the link and records audit
 *
 * DB is mocked; the chain records insert / update / select args so
 * assertions can look at what would have been persisted.
 */

interface Row {
  [k: string]: unknown;
}
interface Table {
  rows: Row[];
  lastInsert?: Row | Row[];
  lastUpdate?: Row;
  updateFilters?: Array<{ col: string; val: unknown } | { col: string; isNull: true }>;
}

const tables: Record<string, Table> = {};

function makeChain(table: string) {
  const t = (tables[table] ??= { rows: [] });
  const state = {
    filter: [...t.rows],
    updatePayload: null as Row | null,
    insertPayload: null as Row | Row[] | null,
    isUpdate: false,
    isInsert: false,
    isUpsert: false,
    updateFilterArgs: [] as Array<{ col: string; val?: unknown; isNull?: boolean }>,
    selectAfterMutation: false,
  };
  const api: Record<string, (...a: unknown[]) => unknown> = {};
  api.select = () => api;
  api.eq = (col: string, val: unknown) => {
    if (state.isUpdate || state.isInsert) {
      state.updateFilterArgs.push({ col, val });
    } else {
      state.filter = state.filter.filter((r) => r[col] === val);
    }
    return api;
  };
  api.is = (col: string, val: unknown) => {
    if (state.isUpdate || state.isInsert) {
      state.updateFilterArgs.push({ col, val: val, isNull: val === null });
    } else {
      state.filter = state.filter.filter((r) => (val === null ? r[col] == null : r[col] === val));
    }
    return api;
  };
  api.in = (col: string, vals: unknown[]) => {
    state.filter = state.filter.filter((r) => (vals as unknown[]).includes(r[col]));
    return api;
  };
  api.maybeSingle = async () =>
    state.filter.length > 0
      ? { data: state.filter[0], error: null }
      : { data: null, error: null };
  api.single = async () => {
    if (state.isInsert || state.isUpsert) {
      const inserted = Array.isArray(state.insertPayload)
        ? state.insertPayload[0]
        : state.insertPayload;
      const row = { id: `id-${table}-${t.rows.length + 1}`, ...(inserted as Row) };
      t.rows.push(row);
      t.lastInsert = state.insertPayload ?? undefined;
      return { data: row, error: null };
    }
    if (state.isUpdate && state.updatePayload) {
      let matched = t.rows;
      for (const f of state.updateFilterArgs) {
        matched = matched.filter((r) =>
          f.isNull ? r[f.col] == null : r[f.col] === f.val,
        );
      }
      const updated = matched.map((r) => Object.assign(r, state.updatePayload));
      t.lastUpdate = state.updatePayload;
      return { data: updated[0] ?? null, error: null };
    }
    return { data: null, error: null };
  };
  api.insert = (payload: unknown) => {
    state.isInsert = true;
    state.insertPayload = payload as Row | Row[];
    if (Array.isArray(payload)) {
      for (const r of payload) t.rows.push({ id: `id-${table}-${t.rows.length + 1}`, ...(r as Row) });
    } else {
      t.rows.push({ id: `id-${table}-${t.rows.length + 1}`, ...(payload as Row) });
    }
    t.lastInsert = payload as Row | Row[];
    return api;
  };
  api.upsert = (payload: unknown) => {
    state.isUpsert = true;
    state.insertPayload = payload as Row | Row[];
    if (Array.isArray(payload)) {
      for (const r of payload) t.rows.push({ id: `id-${table}-${t.rows.length + 1}`, ...(r as Row) });
    } else {
      t.rows.push({ id: `id-${table}-${t.rows.length + 1}`, ...(payload as Row) });
    }
    t.lastInsert = payload as Row | Row[];
    return api;
  };
  api.update = (payload: Row) => {
    state.isUpdate = true;
    state.updatePayload = payload;
    return api;
  };
  api.then = async (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) => {
    if (state.isUpdate && state.updatePayload) {
      let matched = t.rows;
      for (const f of state.updateFilterArgs) {
        matched = matched.filter((r) =>
          f.isNull ? r[f.col] == null : r[f.col] === f.val,
        );
      }
      const updated = matched.map((r) => Object.assign(r, state.updatePayload));
      t.lastUpdate = state.updatePayload;
      return onFulfilled({ data: updated, error: null });
    }
    if (state.isInsert || state.isUpsert) {
      return onFulfilled({ data: [state.insertPayload as unknown], error: null });
    }
    return onFulfilled({ data: state.filter, error: null });
  };
  return api;
}

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (t: string) => makeChain(t) },
}));

import {
  issueInvitation,
  previewInvitationByToken,
  consumeInvitation,
  transferCustomer,
  EnrollmentError,
} from "./enrollment";

const TENANT = "00000000-0000-0000-0000-000000000001";
const OWNER = "00000000-0000-0000-0000-000000000002";
const CUSTOMER = "00000000-0000-0000-0000-000000000003";
const PRODUCT = "00000000-0000-0000-0000-000000000004";
const OTHER_TENANT = "00000000-0000-0000-0000-000000000009";

function seedTenant(status: "pending" | "approved" | "suspended" | "closed" = "approved") {
  tables.storefront_tenants = {
    rows: [
      {
        id: TENANT,
        owner_profile_id: OWNER,
        slug: "acme",
        display_name: "Acme Coffee",
        status,
        brand: {},
        public_page: {},
      },
    ],
  };
}
function seedProfile(linkedTenant: string | null = null, role = "requestor") {
  tables.profiles = {
    rows: [{ id: CUSTOMER, role, storefront_tenant_id: linkedTenant }],
  };
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.storefront_invitations = { rows: [] };
  tables.storefront_customer_prices = { rows: [] };
  tables.storefront_audit_events = { rows: [] };
});

describe("issueInvitation", () => {
  it("creates an invitation with a random token", async () => {
    seedTenant("approved");
    const inv = await issueInvitation({
      tenantId: TENANT,
      invitedBy: OWNER,
      email: "buyer@example.com",
    });
    expect(inv.token).toMatch(/^[a-f0-9]{48}$/);
    expect(inv.tenant_id).toBe(TENANT);
    expect(tables.storefront_audit_events.rows.at(-1)?.action).toBe("customer.invited");
  });

  it("refuses to invite from a pending tenant", async () => {
    seedTenant("pending");
    await expect(
      issueInvitation({ tenantId: TENANT, invitedBy: OWNER }),
    ).rejects.toBeInstanceOf(EnrollmentError);
  });
});

describe("previewInvitationByToken", () => {
  it("reports expired = true when past expiry", async () => {
    seedTenant("approved");
    const past = new Date(Date.now() - 1000).toISOString();
    tables.storefront_invitations.rows.push({
      id: "inv-1",
      tenant_id: TENANT,
      token: "tokenX",
      email: null,
      display_name: null,
      target_role: "location_manager",
      expires_at: past,
      revoked_at: null,
      accepted_at: null,
    });
    const preview = await previewInvitationByToken("tokenX");
    expect(preview?.invitation.expired).toBe(true);
    expect(preview?.tenant.slug).toBe("acme");
  });
});

describe("consumeInvitation", () => {
  it("rejects a profile already linked to another tenant", async () => {
    seedTenant("approved");
    seedProfile(OTHER_TENANT);
    tables.storefront_invitations.rows.push({
      id: "inv-1",
      tenant_id: TENANT,
      token: "goodToken",
      target_role: "location_manager",
      expires_at: new Date(Date.now() + 1_000_000).toISOString(),
      revoked_at: null,
      accepted_at: null,
      quoted_prices: null,
    });
    await expect(
      consumeInvitation({ token: "goodToken", profileId: CUSTOMER }),
    ).rejects.toMatchObject({ code: "PROFILE_LINKED_TO_OTHER_TENANT" });
  });

  it("rejects a revoked invitation", async () => {
    seedTenant("approved");
    seedProfile(null);
    tables.storefront_invitations.rows.push({
      id: "inv-2",
      tenant_id: TENANT,
      token: "revoked",
      target_role: "location_manager",
      expires_at: new Date(Date.now() + 1_000_000).toISOString(),
      revoked_at: new Date().toISOString(),
      accepted_at: null,
      quoted_prices: null,
    });
    await expect(
      consumeInvitation({ token: "revoked", profileId: CUSTOMER }),
    ).rejects.toMatchObject({ code: "INVITATION_REVOKED" });
  });

  it("links a fresh profile and copies quoted_prices", async () => {
    seedTenant("approved");
    seedProfile(null);
    tables.storefront_invitations.rows.push({
      id: "inv-3",
      tenant_id: TENANT,
      token: "fresh",
      target_role: "location_manager",
      expires_at: new Date(Date.now() + 1_000_000).toISOString(),
      revoked_at: null,
      accepted_at: null,
      quoted_prices: [{ product_id: PRODUCT, customer_price: 42.5 }],
    });
    const res = await consumeInvitation({
      token: "fresh",
      profileId: CUSTOMER,
      source: "invitation",
    });
    expect(res.tenantId).toBe(TENANT);
    expect(res.copiedCustomerPrices).toBe(1);
    const profile = tables.profiles.rows[0];
    expect(profile.storefront_tenant_id).toBe(TENANT);
    expect(profile.storefront_enrollment_source).toBe("invitation");
    const priceRow = tables.storefront_customer_prices.rows[0];
    expect(priceRow.product_id).toBe(PRODUCT);
    expect(priceRow.customer_price).toBe(42.5);
    expect(priceRow.source).toBe("invitation");
    expect(priceRow.source_ref_id).toBe("inv-3");
  });
});

describe("transferCustomer", () => {
  it("moves a customer between tenants and audits both sides", async () => {
    seedTenant("approved");
    tables.storefront_tenants.rows.push({
      id: OTHER_TENANT,
      owner_profile_id: "z",
      slug: "other",
      display_name: "Other",
      status: "approved",
      brand: {},
      public_page: {},
    });
    seedProfile(TENANT);
    await transferCustomer({
      customerProfileId: CUSTOMER,
      toTenantId: OTHER_TENANT,
      adminActorId: "admin-1",
      reason: "Merger",
    });
    expect(tables.profiles.rows[0].storefront_tenant_id).toBe(OTHER_TENANT);
    expect(tables.profiles.rows[0].storefront_enrollment_source).toBe("admin_transfer");
    const audit = tables.storefront_audit_events.rows.at(-1);
    expect(audit?.action).toBe("customer.transferred");
    expect(audit?.reason).toBe("Merger");
  });
});
