import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAX_FEATURED_PER_STATE = 3;

/**
 * Featured-operator placement.
 *
 * Self-serve paid subscriptions ran through a third-party checkout that has
 * been removed. GET still reports featured status and slot availability;
 * purchasing/cancelling is no longer self-serve — featured placement is
 * managed by an administrator.
 */

/** GET /api/featured-subscription — check featured status and available slots */
export async function GET(req: NextRequest) {
  const stateParam = req.nextUrl.searchParams.get("state");

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();

  let currentUserFeatured = false;
  let currentUserState: string | null = null;

  if (user) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("featured, state")
      .eq("id", user.id)
      .single();

    currentUserFeatured = profile?.featured === true;
    currentUserState = profile?.state || null;
  }

  const checkState = stateParam || currentUserState;
  let slotsAvailable = MAX_FEATURED_PER_STATE;

  if (checkState) {
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "operator")
      .eq("featured", true)
      .eq("state", checkState);

    slotsAvailable = MAX_FEATURED_PER_STATE - (count || 0);
  }

  return NextResponse.json({
    featured: currentUserFeatured,
    state: checkState,
    slots_available: slotsAvailable,
    max_per_state: MAX_FEATURED_PER_STATE,
    has_subscription: currentUserFeatured,
    self_serve: false,
  });
}

const UNAVAILABLE = {
  error: "Featured placement is managed by an administrator — please contact support.",
};

/** POST — self-serve purchase is no longer available. */
export async function POST() {
  return NextResponse.json(UNAVAILABLE, { status: 503 });
}

/** DELETE — self-serve cancellation is no longer available. */
export async function DELETE() {
  return NextResponse.json(UNAVAILABLE, { status: 503 });
}
