import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  COFFEE_ACK_FIELDS,
  COFFEE_ACK_LABELS,
  allCoffeeAcksChecked,
  coffeeAcksSatisfied,
} from "./coffeeSupplyPackage";

/* Phase 5C-a10.1 — coffee acknowledgment enforcement + persistence. */

const NONE = {};
const ONE = { coffee_ack_exclusive_supply: true };
const TWO = { coffee_ack_exclusive_supply: true, coffee_ack_minimum_purchase: true };
const ALL = {
  coffee_ack_exclusive_supply: true,
  coffee_ack_minimum_purchase: true,
  coffee_ack_shipping_service_return: true,
};

describe("acknowledgment gate — required needs all three", () => {
  it("has exactly three acknowledgments", () => {
    expect(COFFEE_ACK_FIELDS).toHaveLength(3);
    expect(COFFEE_ACK_LABELS).toHaveLength(3);
  });

  it("required + zero/one/two checks → reject (tests 1-3)", () => {
    for (const acks of [NONE, ONE, TWO]) {
      expect(allCoffeeAcksChecked(acks)).toBe(false);
      expect(coffeeAcksSatisfied({ coffeeSupplyRequired: true, acks })).toBe(false);
    }
  });

  it("required + all three → accept (test 4)", () => {
    expect(allCoffeeAcksChecked(ALL)).toBe(true);
    expect(coffeeAcksSatisfied({ coffeeSupplyRequired: true, acks: ALL })).toBe(true);
  });

  it("not required → no checks needed (test 5)", () => {
    expect(coffeeAcksSatisfied({ coffeeSupplyRequired: false, acks: NONE })).toBe(true);
    expect(coffeeAcksSatisfied({ coffeeSupplyRequired: null, acks: null })).toBe(true);
  });
});

/* ---- source guards for server enforcement + persistence ---- */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");
const SIGN_ROUTE = "src/app/api/agreements/sign/[token]/sign/route.ts";
const SIGN_PAGE = "src/app/sign/[token]/page.tsx";
const PDF = "src/lib/generateAgreementPdf.ts";
const COMPONENT = "src/app/components/CoffeeSupplyAgreementSection.tsx";

describe("server enforcement + all-or-nothing persistence (tests 6-8)", () => {
  const src = read(SIGN_ROUTE);
  it("rejects before writing anything when acks are incomplete", () => {
    expect(src).toContain("coffeeAcksSatisfied");
    expect(src).toContain("coffee_acknowledgments_required");
    // the ack check sits before the signature INSERT
    const checkIdx = src.indexOf("coffeeAcksSatisfied");
    const insertIdx = src.indexOf('.from("agreement_signatures")');
    expect(checkIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeLessThan(insertIdx);
  });
  it("persists all three + timestamp together, only when coffee required", () => {
    expect(src).toContain("if (coffeeRequired)");
    expect(src).toContain("coffee_ack_exclusive_supply = true");
    expect(src).toContain("coffee_ack_minimum_purchase = true");
    expect(src).toContain("coffee_ack_shipping_service_return = true");
    expect(src).toContain("coffee_acknowledged_at = now");
  });
  it("does not touch invoices/payments from the sign route (idempotency unchanged, test 15)", () => {
    expect(src).not.toContain('from("invoices").insert');
    expect(src).not.toContain('from("payments").insert');
  });
  it("still blocks re-signing an already-signed agreement (historical unchanged, test 16)", () => {
    expect(src).toContain('["cancelled", "expired", "signed"].includes(agreement.agreement_status)');
  });
});

describe("customer sign page shows agreement, then gates on checkboxes (tests 9-11)", () => {
  const src = read(SIGN_PAGE);
  it("renders the full coffee agreement before the checkboxes", () => {
    const sectionIdx = src.indexOf("CoffeeSupplyAgreementSection");
    const checkboxIdx = src.indexOf("COFFEE_ACK_LABELS");
    expect(sectionIdx).toBeGreaterThan(-1);
    expect(checkboxIdx).toBeGreaterThan(-1);
    expect(sectionIdx).toBeLessThan(checkboxIdx);
  });
  it("disables the sign button until acknowledgments complete", () => {
    expect(src).toContain("!coffeeAcksComplete");
  });
  it("sends the three acknowledgments in the sign request", () => {
    expect(src).toContain("coffee_ack_exclusive_supply: coffeeAcks.coffee_ack_exclusive_supply");
    expect(src).toContain("coffee_ack_shipping_service_return: coffeeAcks.coffee_ack_shipping_service_return");
  });
});

describe("PDF + preview parity: accepted only when persisted true (tests 9-10)", () => {
  it("PDF marks each ack accepted only when its column is true", () => {
    const src = read(PDF);
    expect(src).toContain("COFFEE_ACK_LABELS");
    expect(src).toContain('ag[key] === true');
    expect(src).toContain('accepted ? "[X]" : "[ ]"');
  });
  it("shared component renders acks from the persisted state prop, not assumed accepted", () => {
    const src = read(COMPONENT);
    expect(src).toContain("acknowledgments[key] === true");
    expect(src).toContain("to be accepted at signing");
  });
});

describe("migration adds the four durable columns", () => {
  it("column definitions present and nullable (no default → historical rows untouched)", () => {
    const src = read("supabase/migrations/20260909000000_coffee_supply_acknowledgments.sql");
    expect(src).toContain("coffee_ack_exclusive_supply boolean");
    expect(src).toContain("coffee_ack_minimum_purchase boolean");
    expect(src).toContain("coffee_ack_shipping_service_return boolean");
    expect(src).toContain("coffee_acknowledged_at timestamptz");
    expect(src).not.toContain("DEFAULT true");
  });
});
