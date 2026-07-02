import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "./apiAuth";
import { supabaseAdmin } from "./supabaseAdmin";

export interface OperatorUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

/**
 * Any signed-in profile can see marketplace submissions for contracts they
 * sourced (via a signed agreement). We match by contract.operator_profile_id
 * OR by the operator_email on the source purchase agreement — this way the
 * signing party sees their inbox even if their profile was created after the
 * agreement was drafted.
 */
export async function getOperatorUser(req: NextRequest): Promise<OperatorUser | null> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;
  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role,
  };
}

export function forbidden(msg = "Forbidden"): NextResponse {
  return NextResponse.json({ error: msg }, { status: 403 });
}

/**
 * Contract ids sourced by this operator (via profile id match on the contract,
 * or via a signed purchase agreement whose operator_email matches).
 */
export async function getOperatorContractIds(user: OperatorUser): Promise<string[]> {
  const ids = new Set<string>();

  const { data: byProfile } = await supabaseAdmin
    .from("placement_contracts")
    .select("id")
    .eq("operator_profile_id", user.id);
  (byProfile || []).forEach((r) => ids.add(r.id));

  if (user.email) {
    const { data: agreements } = await supabaseAdmin
      .from("purchase_agreements")
      .select("marketplace_contract_id")
      .ilike("operator_email", user.email)
      .not("marketplace_contract_id", "is", null);
    (agreements || []).forEach((r) => r.marketplace_contract_id && ids.add(r.marketplace_contract_id));
  }

  return Array.from(ids);
}
