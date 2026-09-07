import { describe, it, expect, vi } from "vitest";
import { createSupabaseStub, selectedColumns, type StubStore } from "./__testutils__/supabaseStub";
import { PUBLIC_MACHINE_LISTING_COLUMNS } from "@/lib/machineListings/publicShape";

/**
 * Regression guard for "column machine_listings.sku does not exist".
 *
 * The stub here is column-checked against a DEPLOYED set that is
 * missing one column the assistant selects, so the read must fail loudly
 * the way PostgREST does — proving a nonexistent selected column cannot
 * slip back in silently. The companion catalogSearch tests run the same
 * select against the full deployed set and succeed.
 */
const store: StubStore = {};
const stub = createSupabaseStub(store, [], { columns: { machine_listings: ["id", "status", "title", "created_at"] } });
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));
vi.mock("@/lib/coffeePricing", () => ({ resolveCoffeeProductsPricing: async () => new Map() }));

import { ASSISTANT_MACHINE_SELECT, ASSISTANT_MACHINE_SELECT_COLUMNS, MACHINE_LISTING_DEPLOYED_COLUMNS } from "./machineColumns";
import { searchMachines } from "./catalogSearch";

const MIGRATION_150_ONLY = [
  "sku", "msrp_cents", "lead_time_days", "manufacturer_shipping_notes", "listing_warranty_summary", "spec_sheet_url", "brochure_url",
  "video_url", "dimensions_text", "weight_lbs", "electrical_requirements", "temperature_zone", "payment_system_compatibility", "software_compatibility", "certifications",
];

describe("assistant machine select vs the deployed machine_listings schema", () => {
  it("names only columns that are public AND deployed, and never sku or any migration-150 column", () => {
    for (const c of ASSISTANT_MACHINE_SELECT_COLUMNS) {
      expect(PUBLIC_MACHINE_LISTING_COLUMNS).toContain(c);
      expect(MACHINE_LISTING_DEPLOYED_COLUMNS).toContain(c);
    }
    for (const c of MIGRATION_150_ONLY) {
      expect(ASSISTANT_MACHINE_SELECT_COLUMNS).not.toContain(c);
      expect(MACHINE_LISTING_DEPLOYED_COLUMNS).not.toContain(c);
    }
    expect(ASSISTANT_MACHINE_SELECT).not.toMatch(/\bsku\b/);
  });

  it("never selects seller identity, contact, notes, cost, or partner columns", () => {
    for (const c of ["created_by", "contact_email", "contact_phone", "admin_notes", "wholesale_price_cents", "manufacturer_partner_id"]) {
      expect(ASSISTANT_MACHINE_SELECT_COLUMNS).not.toContain(c);
    }
  });

  it("the deployed set is a superset of the public allowlist minus migration 150 and the hydrated display name", () => {
    const expectedAbsent = new Set([...MIGRATION_150_ONLY, "manufacturer_display_name"]);
    for (const c of PUBLIC_MACHINE_LISTING_COLUMNS) {
      if (expectedAbsent.has(c)) continue;
      expect(MACHINE_LISTING_DEPLOYED_COLUMNS).toContain(c);
    }
  });

  it("selecting a column the database lacks fails the read loudly (no silent empty catalog)", async () => {
    store.machine_listings = [{ id: "M1", status: "active", title: "x", created_at: "2026-01-01" }];
    await expect(searchMachines({ query: null, categorySlug: null, limit: 5 })).rejects.toThrow(/column machine_listings\.\w+ does not exist/);
  });

  it("selectedColumns parses explicit selects and ignores embedded resources", () => {
    expect(selectedColumns("id, name, coffee_categories!coffee_products_category_id_fkey(name, slug), active")).toEqual(["id", "name", "active"]);
    expect(selectedColumns("*")).toEqual([]);
  });
});
