import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Browser client using localStorage for session and PKCE storage.
 * localStorage persists reliably across OAuth redirects, unlike the
 * cookie-based SSR client which loses the PKCE code verifier during
 * cross-domain redirects.
 */
export function createBrowserClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Alias kept for call-sites that reference it explicitly.
 */
export const createPlainBrowserClient = createBrowserClient;
