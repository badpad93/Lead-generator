import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** GET /api/user/purchases — return all leads purchased by the current user */
export async function GET() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  const { data: purchases, error } = await supabaseAdmin
    .from("lead_purchases")
    .select(
      "id, request_id, amount_cents, buyer_email, stripe_checkout_session_id, created_at, vending_requests(id, title, location_name, address, city, state, zip, location_type, machine_types_wanted, estimated_daily_traffic, price, urgency, commission_offered, commission_notes, description, contact_phone, contact_email, decision_maker_name)"
    )
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch purchases" }, { status: 500 });
  }

  return NextResponse.json({ purchases: purchases ?? [] });
}
