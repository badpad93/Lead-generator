import type { Assumptions, PackageKey } from "./assumptions";
import { round2 } from "./engine";
import type { OperatorProfile } from "./profile";

/**
 * The top-down offer ladder and the catalog composition of each package.
 *
 * Machine, freight, placement, and website amounts come from the live
 * catalog (loaded by the server, never typed by the model). Working
 * capital is a financing-request allowance and is never an invoice line.
 */
export interface PackageDefinition {
  key: PackageKey;
  name: string;
  machines: number;
  /** Approved rounded planning estimates from the offer ladder (not a checkout total). */
  estimate_total: number;
  estimate_working_capital: number;
  /** How placements are priced: the 10/10/10 catalog row, or a planning allowance pending the location team. */
  placement_basis: "catalog_10_10_10" | "location_team_allowance";
  pitch: string;
}

export const PACKAGES: Record<PackageKey, PackageDefinition> = {
  ten_ten_ten: {
    key: "ten_ten_ten",
    name: "10/10/10 Launch Plan",
    machines: 10,
    estimate_total: 55_000,
    estimate_working_capital: 10_000,
    placement_basis: "catalog_10_10_10",
    pitch: "Vending Connector's primary full-business launch: ten AI coolers placed in ten locations, with website and working capital, financed as one request.",
  },
  five_machine: {
    key: "five_machine",
    name: "5-Machine Growth Plan",
    machines: 5,
    estimate_total: 30_000,
    estimate_working_capital: 5_000,
    placement_basis: "location_team_allowance",
    pitch: "Five coolers to build a route with a lighter capital and time commitment; placements follow the location-team process.",
  },
  single_machine: {
    key: "single_machine",
    name: "1-Machine Starter Plan",
    machines: 1,
    estimate_total: 7_000,
    estimate_working_capital: 1_000,
    placement_basis: "location_team_allowance",
    pitch: "One cooler to learn the operation with the smallest outlay; placement follows the location-team process.",
  },
};

/** Ladder order: always presented top-down. */
export const LADDER: readonly PackageKey[] = ["ten_ten_ten", "five_machine", "single_machine"];

export function nextDownsell(from: PackageKey): PackageKey | null {
  const i = LADDER.indexOf(from);
  return i >= 0 && i < LADDER.length - 1 ? LADDER[i + 1] : null;
}

/** Catalog keys the plan relies on. Prices are read live; the keys are the only fixed part. */
export const PLAN_CATALOG_KEYS = {
  cooler: "vendera-ai-cooler",
  freight: "vending-machine-freight",
  placement_10_10_10: "location-service-10-10-10",
  placement_allowance_reference: "location-service-tier-1",
  website: "website-creation",
} as const;

export interface CatalogPriceSnapshot {
  key: string;
  name: string;
  unit_price: number;
  active: boolean;
}

/** Live prices for the plan; `null` means the catalog row is missing and the final quote needs catalog correction. */
export interface PlanCatalog {
  cooler: CatalogPriceSnapshot | null;
  freight: CatalogPriceSnapshot | null;
  placement_10_10_10: CatalogPriceSnapshot | null;
  placement_allowance_reference: CatalogPriceSnapshot | null;
  website: CatalogPriceSnapshot | null;
  /** Catalog keys that were expected but not found or inactive. */
  missing: string[];
}

export interface UseOfFunds {
  key: "machines" | "freight" | "placements" | "website" | "opening_inventory" | "working_capital_reserve";
  label: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  /** True when this line is a catalog item that can appear on a quote. */
  quotable: boolean;
  note: string | null;
}

export interface SourcesAndUses {
  uses: UseOfFunds[];
  total_uses: number;
  /** Everything that can be invoiced (machines, freight, placements, website). */
  quotable_subtotal: number;
  /** Working-capital allowance including opening inventory: part of the financing request, never an invoice line. */
  working_capital_allowance: number;
  owner_cash: number;
  financing_request: number;
  placement_note: string;
  website_included: boolean;
}

interface CompositionInput {
  pkg: PackageDefinition;
  machines: number;
  catalog: PlanCatalog;
  a: Assumptions;
  website_included: boolean;
  owner_cash: number;
}

function placementLine(input: CompositionInput): { line: UseOfFunds; note: string } {
  const { pkg, machines, catalog } = input;
  if (pkg.placement_basis === "catalog_10_10_10") {
    const row = catalog.placement_10_10_10;
    const price = row?.unit_price ?? 0;
    return {
      line: { key: "placements", label: row?.name ?? "Location Services 10/10/10", quantity: machines, unit_amount: price, amount: round2(price * machines), quotable: row !== null, note: "Requires recorded 10/10/10 qualification by the location team before checkout." },
      note: "Placements use the live 10/10/10 location-service rate; the location team records qualification before that line can be checked out.",
    };
  }
  const ref = catalog.placement_allowance_reference;
  const price = ref?.unit_price ?? 0;
  return {
    line: { key: "placements", label: "Location-service allowance (tier set by location team)", quantity: machines, unit_amount: price, amount: round2(price * machines), quotable: false, note: "Planning allowance at the Tier 1 catalog rate. The location team determines the actual tier through the existing location-request process; it is not on the quote." },
    note: "Location fees are not on the quote for this package: the location team assesses each site and records the applicable tier before it can be quoted.",
  };
}

function priced(snapshot: CatalogPriceSnapshot | null, fallback: string, quantity: number): Pick<UseOfFunds, "label" | "quantity" | "unit_amount" | "amount" | "quotable"> {
  const price = snapshot?.unit_price ?? 0;
  return { label: snapshot?.name ?? fallback, quantity, unit_amount: price, amount: round2(price * quantity), quotable: snapshot !== null };
}

function catalogUses(input: CompositionInput, placement: UseOfFunds): UseOfFunds[] {
  const { machines, catalog, website_included } = input;
  return [
    { key: "machines", ...priced(catalog.cooler, "VendEra AI Cooler", machines), note: "Requires the machine purchase agreement before checkout." },
    { key: "freight", ...priced(catalog.freight, "Vending Machine Freight", machines), note: "Added automatically, one per cooler." },
    placement,
    { key: "website", ...priced(catalog.website, "Website Creation", website_included ? 1 : 0), note: website_included ? "Included by default; you may decline it." : "Declined by the customer." },
  ];
}

function capitalUses(a: Assumptions, machines: number): { uses: UseOfFunds[]; allowance: number } {
  const inventory = round2(a.opening_inventory_per_cooler * machines);
  const allowance = round2(Math.max(a.working_capital_per_cooler, a.opening_inventory_per_cooler) * machines);
  const reserve = round2(allowance - inventory);
  return {
    allowance,
    uses: [
      { key: "opening_inventory", label: "Opening inventory (startup cash)", quantity: machines, unit_amount: a.opening_inventory_per_cooler, amount: inventory, quotable: false, note: "Part of the working-capital allowance; not a Vending Connector product and not a recurring expense." },
      { key: "working_capital_reserve", label: "Working-capital reserve", quantity: 1, unit_amount: reserve, amount: reserve, quotable: false, note: "Cash cushion for the ramp-up months; never an invoice line." },
    ],
  };
}

/** Sources and uses from live catalog prices plus the working-capital allowance. */
export function sourcesAndUses(input: CompositionInput): SourcesAndUses {
  const placement = placementLine(input);
  const capital = capitalUses(input.a, input.machines);
  const uses = [...catalogUses(input, placement.line), ...capital.uses];
  const total = round2(uses.reduce((s, u) => s + u.amount, 0));
  const quotable = round2(uses.filter((u) => u.quotable).reduce((s, u) => s + u.amount, 0));
  const cash = round2(Math.min(Math.max(0, input.owner_cash), total));
  return { uses, total_uses: total, quotable_subtotal: quotable, working_capital_allowance: capital.allowance, owner_cash: cash, financing_request: round2(total - cash), placement_note: placement.note, website_included: input.website_included };
}

// ─── Recommendation ─────────────────────────────────────────────────

export interface PackageRecommendation {
  /** Always the 10/10/10 plan: it is presented first regardless of fit. */
  lead: PackageKey;
  recommended: PackageKey;
  /** Ladder order with the plain-English reason each rung is or is not suitable. */
  ladder: Array<{ package: PackageKey; name: string; machines: number; estimate_total: number; suitable: boolean; reasons: string[] }>;
  /** True when the customer's own inputs make the lead package unsuitable and Vinnie must say so. */
  honest_downsell: boolean;
}

/** Weekly hours a single owner-operator can reasonably give ten coolers on a 2-per-month rollout. */
const HOURS_PER_MACHINE_PER_WEEK = 1;
/** Cash cushion below which a fully financed package is flagged (share of the working-capital allowance). */
const MIN_CASH_SHARE_OF_WORKING_CAPITAL = 0.5;

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Each rule returns a plain-English concern or null when the package clears it. */
const FIT_RULES: Array<(pkg: PackageDefinition, p: OperatorProfile) => string | null> = [
  (pkg, p) => (p.target_machine_count !== null && p.target_machine_count < pkg.machines ? `You said you want about ${p.target_machine_count} machine${p.target_machine_count === 1 ? "" : "s"}, fewer than this package's ${pkg.machines}.` : null),
  (pkg, p) => (p.weekly_hours_available !== null && p.staffing !== "staffed" && p.weekly_hours_available < pkg.machines * HOURS_PER_MACHINE_PER_WEEK ? `${pkg.machines} coolers need roughly ${pkg.machines * HOURS_PER_MACHINE_PER_WEEK} hours a week to restock and service; you have about ${p.weekly_hours_available}.` : null),
  (pkg, p) => (p.financing_interest === false && p.cash_available !== null && p.cash_available < pkg.estimate_total ? `Without financing, this package needs about ${money(pkg.estimate_total)} and you have about ${money(p.cash_available)} available.` : null),
  (pkg, p) => (p.financing_interest !== false && p.cash_available !== null && p.cash_available < pkg.estimate_working_capital * MIN_CASH_SHARE_OF_WORKING_CAPITAL ? `A financed ${pkg.machines}-machine plan still needs a cash cushion; the working-capital allowance is about ${money(pkg.estimate_working_capital)}.` : null),
  (pkg, p) => (pkg.machines > 1 && p.has_vehicle === false ? "Restocking several coolers needs a vehicle." : null),
  (pkg, p) => (pkg.machines > 1 && p.has_storage === false ? "Multiple coolers need product storage space." : null),
];

function fitReasons(pkg: PackageDefinition, p: OperatorProfile): string[] {
  return FIT_RULES.map((rule) => rule(pkg, p)).filter((r): r is string => r !== null);
}

/** Deterministic top-down recommendation from the customer's own inputs. */
export function recommendPackage(profile: OperatorProfile): PackageRecommendation {
  const ladder = LADDER.map((key) => {
    const pkg = PACKAGES[key];
    const reasons = fitReasons(pkg, profile);
    return { package: key, name: pkg.name, machines: pkg.machines, estimate_total: pkg.estimate_total, suitable: reasons.length === 0, reasons };
  });
  const recommended = ladder.find((r) => r.suitable)?.package ?? "single_machine";
  return { lead: "ten_ten_ten", recommended, ladder, honest_downsell: recommended !== "ten_ten_ten" };
}

/** Rehydrate a stored snapshot (plans keep the catalog they were priced with). */
export function catalogFromSnapshot(raw: unknown): PlanCatalog {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (slot: string): CatalogPriceSnapshot | null => {
    const v = r[slot] as Record<string, unknown> | null | undefined;
    if (!v || typeof v !== "object" || typeof v.key !== "string" || typeof v.unit_price !== "number") return null;
    return { key: v.key, name: String(v.name ?? v.key), unit_price: v.unit_price, active: true };
  };
  const catalog = { cooler: pick("cooler"), freight: pick("freight"), placement_10_10_10: pick("placement_10_10_10"), placement_allowance_reference: pick("placement_allowance_reference"), website: pick("website") };
  const missing = Array.isArray(r.missing) ? r.missing.filter((m): m is string => typeof m === "string") : [];
  return { ...catalog, missing };
}
