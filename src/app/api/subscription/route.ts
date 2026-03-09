import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { createClient } from "@supabase/supabase-js";
import { isAdminByEmail } from "@/lib/adminAuth";

/** GET /api/subscription — check current user's subscription status */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin users always have full access
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user?.email && await isAdminByEmail(user.email)) {
      return NextResponse.json({
        subscribed: true,
        status: "active",
        current_period_end: null,
        cancel_at_period_end: false,
        is_admin: true,
      });
    }
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("status, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .single();

  if (!sub) {
    return NextResponse.json({ subscribed: false, status: null });
  }

  const isActive = sub.status === "active" || sub.status === "trialing";

  return NextResponse.json({
    subscribed: isActive,
    status: sub.status,
    current_period_end: sub.current_period_end,
    cancel_at_period_end: sub.cancel_at_period_end,
  });
}
