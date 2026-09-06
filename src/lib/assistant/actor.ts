import type { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTenantById } from "@/lib/storefront/tenants";
import { GUEST_COOKIE, isWellFormedGuestToken } from "./guestToken";
import type { ToolActorProfile, ToolContext } from "./tools/context";

/**
 * Who is calling. Resolved entirely server-side from the Supabase
 * session (user) or the guest cookie (guest). The request body is never
 * consulted for identity.
 */
export type Actor =
  | { kind: "user"; profile: ToolActorProfile; storefront: ToolContext["storefront"] }
  | { kind: "guest"; token: string }
  | { kind: "anonymous" };

const PROFILE_COLUMNS = "id, full_name, role, coffee_access_enabled, storefront_tenant_id";

async function loadProfile(userId: string): Promise<ToolActorProfile | null> {
  const { data, error } = await supabaseAdmin.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  if (error || !data) return null;
  const p = data as { id: string; full_name: string | null; role: string | null; coffee_access_enabled: boolean | null; storefront_tenant_id: string | null };
  return {
    id: p.id,
    full_name: p.full_name,
    role: p.role,
    coffee_access_enabled: !!p.coffee_access_enabled,
    storefront_tenant_id: p.storefront_tenant_id,
  };
}

async function loadStorefront(profile: ToolActorProfile): Promise<ToolContext["storefront"]> {
  if (!profile.storefront_tenant_id) return null;
  const tenant = await resolveTenantById(profile.storefront_tenant_id);
  if (!tenant || tenant.status !== "approved") return null;
  return { tenantId: tenant.id, customerProfileId: profile.id, display_name: tenant.display_name, slug: tenant.slug };
}

export async function resolveActor(req: NextRequest): Promise<Actor> {
  const userId = await getUserIdFromRequest(req);
  if (userId) {
    const profile = await loadProfile(userId);
    if (profile) return { kind: "user", profile, storefront: await loadStorefront(profile) };
  }
  const token = req.cookies.get(GUEST_COOKIE)?.value;
  if (isWellFormedGuestToken(token)) return { kind: "guest", token };
  return { kind: "anonymous" };
}

export function toolContextFor(actor: Actor, threadId: string): ToolContext {
  if (actor.kind === "user") return { threadId, profile: actor.profile, storefront: actor.storefront };
  return { threadId, profile: null, storefront: null };
}
