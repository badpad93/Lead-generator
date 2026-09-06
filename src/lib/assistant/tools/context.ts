import type { StorefrontContext } from "@/lib/coffeePricing";

/**
 * Everything a tool may know about who is asking. Built by the server
 * from the session; the model never supplies any of it.
 */
export interface ToolActorProfile {
  id: string;
  full_name: string | null;
  role: string | null;
  coffee_access_enabled: boolean;
  storefront_tenant_id: string | null;
}

export interface ToolContext {
  threadId: string;
  /** Null for guests. */
  profile: ToolActorProfile | null;
  /** Set only when the profile is enrolled with an APPROVED tenant. */
  storefront: (StorefrontContext & { display_name: string; slug: string }) | null;
}
