import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "./supabaseAdmin";

export type SalesRole = "admin" | "sales_director" | "sales";

export interface SalesUser {
  id: string;
  email: string;
  role: SalesRole;
}

export function isCrmAdmin(user: SalesUser): boolean {
  return user.role === "admin" || user.role === "sales_director";
}

/**
 * Validate that the request comes from an admin or sales user.
 * Returns the user info or null if unauthorized.
 */
export async function getSalesUser(req: NextRequest): Promise<SalesUser | null> {
  let userId: string | null = null;
  let email: string | null = null;

  // 1. Try Bearer token
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      userId = user.id;
      email = user.email || null;
    }
  }

  // 2. Fall back to cookie session
  if (!userId) {
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return cookieStore.getAll(); },
            setAll() {},
          },
        }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
        email = user.email || null;
      }
    } catch { /* ignore */ }
  }

  if (!userId || !email) return null;

  // 3. Check profile role
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const allowedRoles = new Set<string>(["admin", "sales_director", "sales"]);
  if (!profile || !allowedRoles.has(profile.role)) {
    return null;
  }

  return { id: userId, email, role: profile.role as SalesRole };
}
