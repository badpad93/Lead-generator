import { describe, it, expect } from "vitest";
import { canRepSeeLead, normalizeEmail, dedupeById } from "@/lib/leadActivity";
import type { SalesRole } from "@/lib/salesRoles";

const asUser = (id: string, role: SalesRole) => ({ id, role });

describe("canRepSeeLead", () => {
  it("lets a sales rep see only leads assigned to them", () => {
    const rep = asUser("rep-1", "sales");
    expect(canRepSeeLead("rep-1", rep)).toBe(true);
    expect(canRepSeeLead("rep-2", rep)).toBe(false);
    expect(canRepSeeLead(null, rep)).toBe(false);
  });

  it("lets elevated roles see any lead, including unassigned", () => {
    for (const role of ["admin", "director_of_sales", "market_leader"] as SalesRole[]) {
      const u = asUser("someone", role);
      expect(canRepSeeLead("other-rep", u)).toBe(true);
      expect(canRepSeeLead(null, u)).toBe(true);
    }
  });

  it("lets a sales_manager see any assigned lead but not unassigned", () => {
    const mgr = asUser("mgr", "sales_manager");
    expect(canRepSeeLead("some-rep", mgr)).toBe(true);
    expect(canRepSeeLead(null, mgr)).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
  it("returns null for empty/whitespace/nullish", () => {
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("dedupeById", () => {
  it("keeps the first occurrence and drops later duplicates", () => {
    const rows = [
      { id: "a", n: 1 },
      { id: "b", n: 2 },
      { id: "a", n: 3 },
    ];
    expect(dedupeById(rows)).toEqual([
      { id: "a", n: 1 },
      { id: "b", n: 2 },
    ]);
  });
  it("skips rows without an id", () => {
    const rows = [{ id: "", n: 1 }, { id: "x", n: 2 }];
    expect(dedupeById(rows)).toEqual([{ id: "x", n: 2 }]);
  });
});
