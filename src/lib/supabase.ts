import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Browser client that syncs session to cookies (for middleware auth checks).
 * Use this in client components.
 */
export function createBrowserClient() {
  return createSSRBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Plain browser client without cookie sync.
 * Only needed if you explicitly want localStorage-only behavior.
 */
export function createPlainBrowserClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
