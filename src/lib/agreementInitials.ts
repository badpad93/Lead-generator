/**
 * Which sections a purchase agreement requires the operator to
 * initial — THE single derivation, shared by the signing page (what
 * renders and gates the sign button), the initials route (when to
 * flip to partially_signed) and the sign-submit route (server-side
 * validation).
 *
 * The derivation itself now lives in src/lib/agreements/sections.ts —
 * the single source of agreement structure (inclusion + numbering +
 * initials) — so the required-initials set can never disagree with the
 * sections a document actually renders. This module stays as the stable
 * import path its three consumers already use.
 *
 * Inclusion is deterministic: a conditional section's initials are
 * required only when the section actually applies (snapshot category,
 * or an explicit include flag, or narrow legacy evidence) — never
 * because an unset column defaulted to "included".
 */

import {
  getRequiredInitialKeys as resolveRequiredInitialKeys,
  type AgreementSectionSource,
} from "@/lib/agreements/sections";

export type AgreementInitialsSource = AgreementSectionSource;

export function getRequiredInitialKeys(
  agreement: AgreementInitialsSource | null | undefined,
): string[] {
  return resolveRequiredInitialKeys(agreement);
}
