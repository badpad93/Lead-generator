import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Location services intake (no deposit): the route creates a lead and spawns a
 * location_services workflow for the locations team. Source-level guards.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("request-location intake", () => {
  it("spawns a location_services workflow (no payment gate)", () => {
    const src = read("src/app/api/request-location/route.ts");
    expect(src).toContain("spawnFromLocationRequest");
    expect(src).toContain("spawnWorkflow");
    // no deposit / invoice remains
    expect(src).not.toContain("createInvoice");
  });
  it("the spawn helper targets the locations team and snapshots the lead", () => {
    const hooks = read("src/lib/workflows/hooks.ts");
    expect(hooks).toContain("export async function spawnFromLocationRequest");
    expect(hooks).toContain('workflowType: "location_services"');
    expect(hooks).toContain('primaryTeam: "locations"');
    expect(hooks).toContain("source_intake: snapshotSourceIntake(lead)");
  });
});
