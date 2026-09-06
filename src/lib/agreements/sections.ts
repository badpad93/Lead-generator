/**
 * Agreement structure — the single source of truth for
 *
 *   1. which sections a purchase agreement contains  (inclusion)
 *   2. what number each included section displays as  (numbering)
 *   3. which sections require operator initials        (initials)
 *
 * Before this module those three decisions were made independently in
 * three places — the PDF (src/lib/generateAgreementPdf.ts), the operator
 * preview (src/app/sales/agreements/[id]/page.tsx) and the customer
 * signing page (src/app/sign/[token]/page.tsx) — plus a fourth copy of
 * the initials rule in src/lib/agreementInitials.ts. They disagreed:
 *
 *   - The PDF numbered sections with hardcoded literals, so skipping a
 *     conditional section (Equipment / Location / Shipping) left a gap
 *     in the printed numbers (2 -> 6).
 *   - Every renderer decided inclusion with `include_* !== false`, which
 *     defaults a NULL column to "included"; the PDF additionally used
 *     `hasSnapshot ? hasCategory(...) : true`, so a missing snapshot
 *     silently turned conditional clauses ON.
 *   - Initials keys are display-number-named (section_3 … section_8), so
 *     a PDF that renumbered would attach the wrong initials box.
 *
 * This module fixes inclusion and initials centrally and hands every
 * renderer a numberer so their visible numbers are contiguous. Each
 * document keeps its own authored ordering and legal text — it just
 * asks this module WHETHER a section applies, WHAT number it is, and
 * WHETHER it needs initials.
 *
 * Commercial values are NOT computed here — that is lineItems.ts's job
 * (Phase 1). This module only reads the authoritative agreement/snapshot
 * data to decide structure.
 */

import type { ItemCategory, SnapshotLine } from "@/lib/pricing/lineItems";

/* ------------------------------------------------------------------ */
/*  Stable section identity                                            */
/* ------------------------------------------------------------------ */

/**
 * Stable internal identifiers. These never change with renumbering —
 * `equipment_purchase` is always the equipment section whether it prints
 * as Section 3 (all sections present) or Section 3-after-nothing-skipped.
 * The DISPLAY number is assigned separately, at render time.
 */
export type AgreementSectionId =
  | "equipment_purchase"
  | "shipping_freight"
  | "location_services"
  | "payment_terms"
  | "location_service_payment"
  | "storage_program"
  | "schedule_a"
  | "schedule_b"
  | "schedule_c";

/**
 * The stored initials key for a section. These strings are the keys the
 * operator's initials are persisted under in agreement_initials
 * (`section_key`), so they are OPAQUE, backward-compatible identifiers —
 * bound to the stable section id, never recomputed from a display
 * number. They keep the historical `section_N` spelling only so existing
 * in-flight signatures keep matching; nothing derives a number from them.
 */
const INITIALS_KEY: Partial<Record<AgreementSectionId, string>> = {
  equipment_purchase: "section_3",
  shipping_freight: "section_4",
  location_services: "section_5",
  payment_terms: "section_6",
  location_service_payment: "section_7",
  storage_program: "section_8",
  schedule_a: "schedule_a",
  schedule_b: "schedule_b",
  schedule_c: "schedule_c",
};

/* ------------------------------------------------------------------ */
/*  Deterministic inclusion                                            */
/* ------------------------------------------------------------------ */

/** The subset of a purchase_agreements row this module reads. */
export interface AgreementSectionSource {
  agreement_type?: string | null;
  line_items_snapshot?: unknown;
  include_equipment?: boolean | null;
  include_location_services?: boolean | null;
  include_shipping_storage?: boolean | null;
  include_financing?: boolean | null;
  coffee_supply_required?: boolean | null;
  storage_fee_per_machine_month?: number | string | null;
  // Narrow legacy evidence — only consulted for pre-snapshot agreements
  // whose include_* column is unknown (null/undefined).
  machine_quantity?: number | string | null;
  equipment_subtotal?: number | string | null;
  locations_purchased?: number | string | null;
  freight_total?: number | string | null;
}

/** Which conditional sections / riders apply to this agreement. */
export interface ResolvedSections {
  equipment: boolean;
  location: boolean;
  shipping: boolean;
  /** Storage sub-section — only when shipping applies AND a fee is set. */
  storage: boolean;
  coffee: boolean;
  financing: boolean;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Decide a conditional commercial section deterministically.
 *
 *   1. If a line-item snapshot exists it is authoritative — the section
 *      applies iff a line of that category is present.
 *   2. Otherwise an EXPLICIT include flag wins (true -> in, false -> out).
 *   3. Otherwise (no snapshot AND unknown flag: a pre-snapshot agreement)
 *      fall back to scalar evidence already on the row. This is the ONLY
 *      fallback and it is evidence-based — it never blindly assumes true.
 */
function conditionalApplies(
  hasSnapshot: boolean,
  categoryPresent: boolean,
  explicitFlag: boolean | null | undefined,
  legacyEvidence: number,
): boolean {
  if (hasSnapshot) return categoryPresent;
  if (explicitFlag === true) return true;
  if (explicitFlag === false) return false;
  return legacyEvidence > 0;
}

export function resolveAgreementSections(
  ag: AgreementSectionSource | null | undefined,
): ResolvedSections {
  if (!ag) {
    return {
      equipment: false,
      location: false,
      shipping: false,
      storage: false,
      coffee: false,
      financing: false,
    };
  }

  const snapshot: SnapshotLine[] = Array.isArray(ag.line_items_snapshot)
    ? (ag.line_items_snapshot as SnapshotLine[])
    : [];
  const hasSnapshot = snapshot.length > 0;
  const hasCategory = (c: ItemCategory) => snapshot.some((l) => l.category === c);

  const equipment = conditionalApplies(
    hasSnapshot,
    hasCategory("equipment"),
    ag.include_equipment,
    num(ag.machine_quantity) || num(ag.equipment_subtotal),
  );
  const location = conditionalApplies(
    hasSnapshot,
    hasCategory("location_services"),
    ag.include_location_services,
    num(ag.locations_purchased),
  );
  const shipping = conditionalApplies(
    hasSnapshot,
    hasCategory("freight"),
    ag.include_shipping_storage,
    num(ag.freight_total),
  );
  // Coffee / financing are opt-in: snapshot category when present, else
  // an explicit flag. No legacy scalar fallback (they had no scalar).
  const coffee = hasSnapshot ? hasCategory("coffee") : ag.coffee_supply_required === true;
  const financing = hasSnapshot ? hasCategory("financing") : ag.include_financing === true;

  // Storage is not a standalone line item — it renders only when
  // shipping applies AND an explicit monthly fee is set.
  const storage = shipping && num(ag.storage_fee_per_machine_month) > 0;

  return { equipment, location, shipping, storage, coffee, financing };
}

/* ------------------------------------------------------------------ */
/*  Sequential numbering                                              */
/* ------------------------------------------------------------------ */

export interface SectionNumberer {
  /** Assign the next contiguous number to `id` (or an ad-hoc string key
   *  for a renderer's general clauses) and remember it. */
  assign(id: string): number;
  /** The number already assigned to `id`, or undefined if not assigned
   *  (e.g. the section was excluded). Lets legal cross-references resolve
   *  to the current display number instead of a hardcoded literal. */
  numberOf(id: string): number | undefined;
}

/**
 * A running counter shared within one render pass. Each document calls
 * `assign(id)` in its own authored order, for the sections it actually
 * includes, so the visible numbers are always 1,2,3,… with no gaps —
 * regardless of which conditional sections were skipped.
 */
export function createSectionNumberer(start = 1): SectionNumberer {
  let next = start;
  const assigned = new Map<string, number>();
  return {
    assign(id: string): number {
      const n = next++;
      assigned.set(id, n);
      return n;
    },
    numberOf(id: string): number | undefined {
      return assigned.get(id);
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Initials                                                           */
/* ------------------------------------------------------------------ */

/**
 * The initials keys this agreement requires, deterministically and bound
 * to stable section ids (then mapped to their stored key strings). This
 * is THE derivation shared by the signing page, the initials route and
 * the sign-submit route, so the page can never render a different set
 * than the server validates.
 */
export function getRequiredInitialKeys(
  ag: AgreementSectionSource | null | undefined,
): string[] {
  if (!ag) return [];
  // Location Placement agreements use their own layout with no
  // per-section initials.
  if (ag.agreement_type === "location_placement") return [];

  const s = resolveAgreementSections(ag);
  // [applies, section id] in document order. Payment Terms is always
  // required; every other entry follows its section's applicability.
  const plan: Array<[boolean, AgreementSectionId]> = [
    [s.equipment, "equipment_purchase"],
    [s.shipping, "shipping_freight"],
    [s.location, "location_services"],
    [true, "payment_terms"],
    [s.location, "location_service_payment"],
    [s.storage, "storage_program"],
    [s.equipment, "schedule_a"],
    [s.location, "schedule_b"],
    [s.shipping, "schedule_c"],
  ];

  const keys: string[] = [];
  for (const [applies, id] of plan) {
    if (!applies) continue;
    const key = INITIALS_KEY[id];
    if (key) keys.push(key);
  }
  return keys;
}

/** The stored initials key for a stable section id (for renderers that
 *  bind an initials box to a section by id rather than display number). */
export function initialsKeyFor(id: AgreementSectionId): string | undefined {
  return INITIALS_KEY[id];
}
