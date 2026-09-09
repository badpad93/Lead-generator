/**
 * Coffee-supply package inclusion — the single rule every surface shares.
 *
 * Model A (intended for the machine-purchase context): when the source
 * order includes a coffee brewer line, the purchase agreement captures the
 * Equipment Loan & Beverage Supply Agreement onto coffee_supply_snapshot at
 * creation, and the customer's SINGLE signature on the purchase agreement
 * covers both documents. So the FROZEN captured snapshot — not the latest
 * template — must appear in every rendering of the signing package (admin
 * preview, customer signing page, generated PDF, signed PDF).
 *
 * This module decides, from the two stored fields, whether the coffee
 * agreement should be included and whether a required-but-unusable snapshot
 * must BLOCK sending (so required terms are never silently omitted). Pure
 * and env-free for unit testing.
 */

export interface CoffeeSupplySnapshotLike {
  title?: string | null;
  version?: number | string | null;
  content_html?: string | null;
  effective_date?: string | null;
  captured_at?: string | null;
}

/** A snapshot is usable only when it carries substantive captured content. */
export function isUsableCoffeeSnapshot(snapshot: unknown): snapshot is CoffeeSupplySnapshotLike {
  if (!snapshot || typeof snapshot !== "object") return false;
  const html = (snapshot as CoffeeSupplySnapshotLike).content_html;
  return typeof html === "string" && html.trim().length > 0;
}

export interface CoffeePackageState {
  /** Render the captured coffee agreement in the signing package. */
  include: boolean;
  /** Block sending — required, but no usable captured snapshot exists. */
  block: boolean;
  reason?: string;
}

/**
 * Decide the coffee package state from the agreement's stored fields.
 *
 *  - not required            -> omit (no coffee terms belong in the package)
 *  - required + usable       -> include the captured snapshot
 *  - required + NOT usable   -> block sending (never silently omit required
 *                               terms the admin says the signature covers)
 */
export function coffeePackageState(input: {
  coffeeSupplyRequired: boolean | null | undefined;
  coffeeSupplySnapshot: unknown;
}): CoffeePackageState {
  if (input.coffeeSupplyRequired !== true) {
    return { include: false, block: false };
  }
  if (isUsableCoffeeSnapshot(input.coffeeSupplySnapshot)) {
    return { include: true, block: false };
  }
  return {
    include: false,
    block: true,
    reason: "coffee_supply_required_but_snapshot_missing",
  };
}

/* ------------------------------------------------------------------ */
/*  Acknowledgments (Phase 5C-a10.1)                                   */
/* ------------------------------------------------------------------ */

/** The three acknowledgments the captured coffee agreement requires the
 *  customer to check on the signing page. Ordered; shared by the sign page
 *  (checkboxes), the server validation, and the PDF (accepted list) so all
 *  three surfaces list identical items. */
export const COFFEE_ACK_FIELDS = [
  "coffee_ack_exclusive_supply",
  "coffee_ack_minimum_purchase",
  "coffee_ack_shipping_service_return",
] as const;

export type CoffeeAckField = (typeof COFFEE_ACK_FIELDS)[number];

export const COFFEE_ACK_LABELS: ReadonlyArray<{ key: CoffeeAckField; label: string }> = [
  { key: "coffee_ack_exclusive_supply", label: "Exclusive supply requirement acknowledged" },
  {
    key: "coffee_ack_minimum_purchase",
    label: "$1,000 per machine per month minimum purchase acknowledged",
  },
  {
    key: "coffee_ack_shipping_service_return",
    label: "Shipping / installation / service / return obligations acknowledged",
  },
];

export type CoffeeAcknowledgments = Partial<Record<CoffeeAckField, boolean | null | undefined>>;

/** True only when ALL THREE acknowledgments are explicitly true. */
export function allCoffeeAcksChecked(acks: CoffeeAcknowledgments | null | undefined): boolean {
  if (!acks) return false;
  return COFFEE_ACK_FIELDS.every((f) => acks[f] === true);
}

/**
 * Whether a signing attempt may proceed given the coffee requirement and the
 * submitted acknowledgments. When coffee is not required, no acks are needed;
 * when required, all three must be checked. Pure — used by both the client
 * (disable submit) and the server (reject the request).
 */
export function coffeeAcksSatisfied(input: {
  coffeeSupplyRequired: boolean | null | undefined;
  acks: CoffeeAcknowledgments | null | undefined;
}): boolean {
  if (input.coffeeSupplyRequired !== true) return true;
  return allCoffeeAcksChecked(input.acks);
}
