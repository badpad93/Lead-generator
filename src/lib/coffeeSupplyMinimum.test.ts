import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { COFFEE_ACK_LABELS } from "./agreements/coffeeSupplyPackage";

/*
 * The Equipment Loan & Beverage Supply minimum is $360 per brewer per month
 * (v4). Guards that the amount + wording are consistent across the contract
 * template, the acknowledgments, and the UI copy.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("coffee supply minimum is $360 per brewer per month", () => {
  it("the v4 agreement template sets $360.00 per brewer per month", () => {
    const sql = read("supabase/migrations/20261028000000_coffee_supply_agreement_v4.sql");
    expect(sql).toContain("Three Hundred Sixty Dollars ($360.00) per brewer per month");
    expect(sql).toContain("minimum purchase requirement of $360 per brewer per month");
    expect(sql).not.toContain("One Thousand Dollars ($1,000.00) per machine per month");
  });
  it("the acknowledgment label reflects $360 per brewer per month", () => {
    const min = COFFEE_ACK_LABELS.find((a) => a.key === "coffee_ack_minimum_purchase");
    expect(min?.label).toContain("$360 per brewer per month");
    expect(min?.label).not.toContain("1,000");
  });
  it("the checkout form + coffee agreement page show $360 per brewer", () => {
    const form = read("src/app/smart-coolers/[id]/checkout/CheckoutForm.tsx");
    expect(form).toContain("$360 per brewer, per month minimum");
    expect(form).not.toContain("$1,000 per machine");
    const page = read("src/app/coffee/agreement/page.tsx");
    expect(page).toContain("$360/brewer/month");
  });
});
