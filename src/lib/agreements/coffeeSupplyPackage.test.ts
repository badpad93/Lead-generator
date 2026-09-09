import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isUsableCoffeeSnapshot, coffeePackageState } from "./coffeeSupplyPackage";

/* Phase 5C-a10 Defect 3 — Model A: one signature covers the machine
 * purchase AND the captured Equipment Loan & Beverage Supply Agreement.
 * The frozen snapshot must appear in every renderer; a required-but-missing
 * snapshot must block sending. */

const USABLE = {
  title: "Apex AI Vending — Equipment Loan & Beverage Supply Agreement",
  version: 3,
  effective_date: "2026-08-28",
  content_html: "<h1>Beverage Supply</h1><p>Exclusive supply terms…</p>",
  captured_at: "2026-08-28T00:00:00Z",
};

describe("isUsableCoffeeSnapshot", () => {
  it("requires substantive captured content_html", () => {
    expect(isUsableCoffeeSnapshot(USABLE)).toBe(true);
    expect(isUsableCoffeeSnapshot({ ...USABLE, content_html: "" })).toBe(false);
    expect(isUsableCoffeeSnapshot({ ...USABLE, content_html: "   " })).toBe(false);
    expect(isUsableCoffeeSnapshot({ title: "x" })).toBe(false);
    expect(isUsableCoffeeSnapshot(null)).toBe(false);
    expect(isUsableCoffeeSnapshot(undefined)).toBe(false);
  });
});

describe("coffeePackageState", () => {
  it("not required → omit, do not block", () => {
    const r = coffeePackageState({ coffeeSupplyRequired: false, coffeeSupplySnapshot: null });
    expect(r).toEqual({ include: false, block: false });
  });
  it("required + usable snapshot → include (#108 shape)", () => {
    const r = coffeePackageState({ coffeeSupplyRequired: true, coffeeSupplySnapshot: USABLE });
    expect(r.include).toBe(true);
    expect(r.block).toBe(false);
  });
  it("required + missing/unusable snapshot → BLOCK sending (never silently omit)", () => {
    const r = coffeePackageState({ coffeeSupplyRequired: true, coffeeSupplySnapshot: null });
    expect(r.include).toBe(false);
    expect(r.block).toBe(true);
    expect(r.reason).toBe("coffee_supply_required_but_snapshot_missing");
  });
});

/* ---- parity source guards: same captured snapshot on every surface ---- */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("coffee package rendered consistently across all four surfaces", () => {
  it("shared component renders the FROZEN snapshot content_html", () => {
    const src = read("src/app/components/CoffeeSupplyAgreementSection.tsx");
    expect(src).toContain("isUsableCoffeeSnapshot");
    expect(src).toContain("content_html");
    expect(src).toContain("also covers");
  });
  it("admin preview includes the coffee section", () => {
    const src = read("src/app/sales/agreements/[id]/page.tsx");
    expect(src).toContain("CoffeeSupplyAgreementSection");
    expect(src).toContain("agreement.coffee_supply_snapshot");
  });
  it("customer signing page includes the coffee section + names it in the acknowledgment", () => {
    const src = read("src/app/sign/[token]/page.tsx");
    expect(src).toContain("CoffeeSupplyAgreementSection");
    expect(src).toContain("coffee_supply_required");
    expect(src).toContain("Equipment Loan & Beverage Supply Agreement set out above");
  });
  it("generated/signed PDF renders the captured snapshot from htmlToBlocks", () => {
    const src = read("src/lib/generateAgreementPdf.ts");
    expect(src).toContain("isUsableCoffeeSnapshot");
    expect(src).toContain("htmlToBlocks");
    expect(src).toContain("coffee_supply_snapshot");
  });
  it("send route blocks when coffee is required but the snapshot is unusable", () => {
    const src = read("src/app/api/sales/agreements/[id]/send/route.ts");
    expect(src).toContain("coffeePackageState");
    expect(src).toContain("coffee.block");
    expect(src).toContain("status: 409");
  });
});
