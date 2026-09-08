import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseStub, type StubStore } from "@/lib/assistant/__testutils__/supabaseStub";

/**
 * Linking a financing application to a quote is metadata only and is
 * gated on a verified reference plus ownership. Supabase is the
 * in-memory stub; nothing else is touched.
 */
const store: StubStore = {};
const stub = createSupabaseStub(store, []);
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));

import { linkQuoteToApplication } from "./financingLinkage";
import { signQuoteRef } from "./financingLink";

const U1 = "11111111-1111-4111-8111-000000000001";
const U2 = "11111111-1111-4111-8111-000000000002";
const Q1 = "22222222-2222-4222-8222-000000000001";
const APP = "33333333-3333-4333-8333-000000000001";

beforeEach(() => {
  process.env.ASSISTANT_HASH_SECRET = "test-secret";
  for (const k of Object.keys(store)) delete store[k];
  store.commerce_quotes = [{ id: Q1, user_id: U1, status: "confirmed", total: 4200, financing_program: "standard", financing_status: "interested", financing_application_id: null }];
});

const quote = () => store.commerce_quotes[0];

describe("linkQuoteToApplication", () => {
  it("links the owner's quote and records application_submitted without touching totals or status", async () => {
    expect(await linkQuoteToApplication(signQuoteRef(Q1), APP, U1)).toBe("linked");
    expect(quote().financing_application_id).toBe(APP);
    expect(quote().financing_status).toBe("application_submitted");
    expect(quote().status).toBe("confirmed");
    expect(quote().total).toBe(4200);
  });
  it("ignores a missing reference", async () => {
    expect(await linkQuoteToApplication(undefined, APP, U1)).toBe("no_ref");
    expect(await linkQuoteToApplication("", APP, U1)).toBe("no_ref");
    expect(quote().financing_application_id).toBeNull();
  });
  it("rejects a tampered or unsigned reference and an anonymous applicant", async () => {
    expect(await linkQuoteToApplication(Q1, APP, U1)).toBe("invalid_ref");
    expect(await linkQuoteToApplication(signQuoteRef(Q1).slice(0, -2) + "zz", APP, U1)).toBe("invalid_ref");
    expect(await linkQuoteToApplication(signQuoteRef(Q1), APP, null)).toBe("invalid_ref");
    expect(quote().financing_application_id).toBeNull();
  });
  it("never links a stranger's quote even with a valid reference", async () => {
    expect(await linkQuoteToApplication(signQuoteRef(Q1), APP, U2)).toBe("not_owner");
    expect(quote().financing_application_id).toBeNull();
    expect(quote().financing_status).toBe("interested");
  });
  it("reports not_found for an unknown quote id", async () => {
    expect(await linkQuoteToApplication(signQuoteRef("22222222-2222-4222-8222-000000000009"), APP, U1)).toBe("not_found");
  });
});
