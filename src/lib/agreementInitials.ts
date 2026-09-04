/**
 * Which sections a purchase agreement requires the operator to
 * initial — THE single derivation, shared by the signing page (what
 * renders and gates the sign button), the initials route (when to
 * flip to partially_signed) and the sign-submit route (server-side
 * validation).
 *
 * The sign-submit route used to validate against a hardcoded list of
 * all nine keys while the page had gone adaptive — so an agreement
 * whose line items only produced three sections rendered three
 * initials fields and then refused to sign with "All 9 sections must
 * be initialed. 3 of 9 completed." The agreement adapts to the items
 * present; the required-initials set adapts with it.
 */

export interface AgreementInitialsSource {
  agreement_type?: string | null;
  include_equipment?: boolean | null;
  include_location_services?: boolean | null;
  include_shipping_storage?: boolean | null;
  storage_fee_per_machine_month?: number | string | null;
}

export function getRequiredInitialKeys(
  agreement: AgreementInitialsSource | null | undefined,
): string[] {
  if (!agreement) return [];
  // Location Placement agreements use their own layout with no
  // per-section initials — nothing to require.
  if (agreement.agreement_type === "location_placement") return [];

  const includeEq = agreement.include_equipment !== false;
  const includeLoc = agreement.include_location_services !== false;
  const includeShip = agreement.include_shipping_storage !== false;

  const keys: string[] = [];
  if (includeEq) keys.push("section_3");
  if (includeShip) keys.push("section_4");
  if (includeLoc) keys.push("section_5");
  keys.push("section_6"); // Payment Terms always required
  if (includeLoc) keys.push("section_7");
  // Storage Program (section 8) only renders — and only needs
  // initials — when a storage fee is actually set. Storage is not a
  // line item in the quote/order flow, so by default there is none.
  if (includeShip && Number(agreement.storage_fee_per_machine_month) > 0) {
    keys.push("section_8");
  }
  if (includeEq) keys.push("schedule_a");
  if (includeLoc) keys.push("schedule_b");
  if (includeShip) keys.push("schedule_c");
  return keys;
}
