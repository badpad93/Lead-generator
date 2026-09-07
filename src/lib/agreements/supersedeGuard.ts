/**
 * Pure supersession decision (no DB/env imports, so it is unit-testable).
 *
 * Only an agreement the customer has received but NOT begun signing may be
 * superseded by the reissue path: `signed`, `partially_signed`,
 * `countersigned`, `executed` require a separate explicit process;
 * `draft`/`generated` are refreshed in place by upsert and need no
 * supersession; `cancelled`/`expired` are already terminal.
 */
export const SUPERSEDABLE_STATUSES = ["sent", "viewed"] as const;

export interface SupersedeAssessment {
  ok: boolean;
  reason?: string;
}

export function canSupersede(agreement: {
  agreement_status?: string | null;
  operator_signed_at?: string | null;
  apex_signed_at?: string | null;
}): SupersedeAssessment {
  if (agreement.operator_signed_at || agreement.apex_signed_at) {
    return { ok: false, reason: "already_signed" };
  }
  const status = String(agreement.agreement_status ?? "");
  if (["signed", "partially_signed", "countersigned", "executed"].includes(status)) {
    return { ok: false, reason: `signed_status:${status}` };
  }
  if (!(SUPERSEDABLE_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, reason: `not_supersedable_status:${status}` };
  }
  return { ok: true };
}
