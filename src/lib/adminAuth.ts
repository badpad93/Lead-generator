import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabaseAdmin";

const ADMIN_EMAILS = [
  "contact@bytebitevending.com",
];

/**
 * Check if the authenticated user is an admin.
 * Returns the user ID if admin, null otherwise.
 */
export async function getAdminUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  // Check email against admin list
  if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return user.id;
  }

  return null;
}

/**
 * Check admin status by profile ID (for client-side usage via API).
 */
export async function isAdminByEmail(email: string): Promise<boolean> {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
