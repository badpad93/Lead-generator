import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseStub, type StubStore } from "@/lib/assistant/__testutils__/supabaseStub";

const store: StubStore = {};
const stub = createSupabaseStub(store);
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));

import { financingPlanUrl, linkPlanToApplication, signPlanRef, verifyPlanRef, FINANCING_PATH, SIGN_IN_PATH } from "./financingRef";

const PLAN = "0d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a11";
const QUOTE = "0d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a22";
const APP = "0d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a33";
const U1 = "11111111-1111-4111-8111-000000000001";
const U2 = "11111111-1111-4111-8111-000000000002";

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  store.commerce_business_plans = [{ id: PLAN, user_id: U1, financing_status: "application_started", financing_application_id: null }];
});

describe("signed plan reference and fixed return path", () => {
  it("signs with the dedicated assistant secret, verifies, and rejects tampering", () => {
    const ref = signPlanRef(PLAN);
    expect(ref.startsWith(`${PLAN}.`)).toBe(true);
    expect(verifyPlanRef(ref)).toBe(PLAN);
    expect(verifyPlanRef(`${PLAN}.` + "A".repeat(32))).toBeNull();
    expect(verifyPlanRef(ref.slice(0, -1))).toBeNull();
    expect(verifyPlanRef(`${QUOTE}.${ref.split(".")[1]}`)).toBeNull();
    expect(verifyPlanRef(null)).toBeNull();
    expect(verifyPlanRef("")).toBeNull();
  });
  it("the financing and sign-in paths are fixed, first-party, and carry only signed ids (no open redirect)", () => {
    expect(FINANCING_PATH).toBe("/financing");
    expect(SIGN_IN_PATH).toBe("/login?redirect=/assistant");
    const url = financingPlanUrl(PLAN, QUOTE);
    expect(url).toMatch(/^\/financing\?plan=[0-9a-f-]{36}\.[A-Za-z0-9_-]{32}&quote=[0-9a-f-]{36}\.[A-Za-z0-9_-]{32}$/);
    expect(financingPlanUrl(PLAN, null)).toMatch(/^\/financing\?plan=[^&]+$/);
    expect(url).not.toMatch(/https?:|\/\//);
  });
});

describe("linkPlanToApplication", () => {
  it("links the owner's plan as application_submitted and ignores bad, foreign, or missing references", async () => {
    expect(await linkPlanToApplication(undefined, APP, U1)).toBe("no_ref");
    expect(await linkPlanToApplication("garbage", APP, U1)).toBe("invalid_ref");
    expect(await linkPlanToApplication(signPlanRef(PLAN), APP, null)).toBe("invalid_ref");
    expect(await linkPlanToApplication(signPlanRef(PLAN), APP, U2)).toBe("not_owner");
    expect(await linkPlanToApplication(signPlanRef(QUOTE), APP, U1)).toBe("not_found");
    expect(store.commerce_business_plans[0]).toMatchObject({ financing_application_id: null, financing_status: "application_started" });
    expect(await linkPlanToApplication(signPlanRef(PLAN), APP, U1)).toBe("linked");
    expect(store.commerce_business_plans[0]).toMatchObject({ financing_application_id: APP, financing_status: "application_submitted" });
  });
});
