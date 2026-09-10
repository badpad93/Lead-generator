import type { PlanCatalog } from "../packages";

/** Live-catalog snapshot as seeded by migration 20260907221651. Test-only. */
export const CATALOG: PlanCatalog = {
  cooler: { key: "vendera-ai-cooler", name: "VendEra AI Cooler", unit_price: 3700, active: true },
  freight: { key: "vending-machine-freight", name: "Vending Machine Freight", unit_price: 500, active: true },
  placement_10_10_10: { key: "location-service-10-10-10", name: "Location Services 10/10/10", unit_price: 400, active: true },
  placement_allowance_reference: { key: "location-service-tier-1", name: "Location Services Tier 1", unit_price: 500, active: true },
  website: { key: "website-creation", name: "Website Creation", unit_price: 500, active: true },
  missing: [],
};
