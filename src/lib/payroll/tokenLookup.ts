import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashToken } from "./token";

/**
 * Resolve a raw payroll invitation token to its profile + status
 * flags. Used by every /api/payroll/[token]/* handler.
 *
 * Consumers should treat null as "invalid/expired/revoked" and
 * return a 404 without leaking why (avoid enumeration).
 */
export interface ResolvedToken {
  invitation_id: string;
  profile_id: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

export async function resolveRawPayrollToken(raw: string): Promise<ResolvedToken | null> {
  if (!raw || raw.length < 20) return null;
  const hash = hashToken(raw);
  const { data } = await supabaseAdmin
    .from("payroll_invitations")
    .select("id, profile_id, expires_at, used_at, revoked_at")
    .eq("token_hash", hash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    invitation_id: data.id as string,
    profile_id: data.profile_id as string,
    expires_at: data.expires_at as string,
    used_at: (data.used_at as string | null) ?? null,
    revoked_at: (data.revoked_at as string | null) ?? null,
  };
}

export function isTokenLive(tok: ResolvedToken): boolean {
  if (tok.revoked_at) return false;
  if (tok.used_at) return false;
  if (new Date(tok.expires_at).getTime() < Date.now()) return false;
  return true;
}
