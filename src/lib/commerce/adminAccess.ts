import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminByEmail } from "@/lib/adminAuth";

/**
 * Verified administrator status for a signed-in user id, from
 * authoritative server-side data only: the profile role (service-role
 * read) or the auth record's email/app_metadata (server-managed). Never
 * from user_metadata, a cookie, a header, or the request body.
 */
async function profileIsAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).maybeSingle();
  return profile?.role === "admin";
}

async function authRecordIsAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  const user = data?.user;
  if (!user) return false;
  if (user.email && (await isAdminByEmail(user.email))) return true;
  return (user.app_metadata as Record<string, unknown> | undefined)?.role === "admin";
}

export async function isVerifiedAdmin(userId: string): Promise<boolean> {
  try {
    return (await profileIsAdmin(userId)) || (await authRecordIsAdmin(userId));
  } catch (e) {
    console.error("[commerce/adminAccess] admin check failed:", e instanceof Error ? e.message : String(e));
    return false;
  }
}
