import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/verify-purchase — fallback for when the Stripe webhook
 * hasn't fired yet.  Called after the buyer returns from Stripe checkout.
 * Checks the Stripe session status and promotes the purchase to "completed"
 * if payment succeeded.
 */
export async function POST(req: NextRequest) {
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

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { requestId } = await req.json();
  if (!requestId) {
    return NextResponse.json(
      { error: "requestId is required" },
      { status: 400 }
    );
  }

  // Look up the pending purchase for this user + request
  const { data: purchase } = await supabaseAdmin
    .from("lead_purchases")
    .select("id, stripe_checkout_session_id, status")
    .eq("user_id", user.id)
    .eq("request_id", requestId)
    .single();

  if (!purchase) {
    return NextResponse.json(
      { error: "No purchase found" },
      { status: 404 }
    );
  }

  // Already completed — nothing to do
  if (purchase.status === "completed") {
    return NextResponse.json({ status: "completed" });
  }

  if (!purchase.stripe_checkout_session_id) {
    return NextResponse.json(
      { error: "No Stripe session found" },
      { status: 400 }
    );
  }

  // Ask Stripe whether payment actually succeeded
  const session = await stripe.checkout.sessions.retrieve(
    purchase.stripe_checkout_session_id
  );

  if (session.payment_status !== "paid") {
    return NextResponse.json({ status: purchase.status });
  }

  // Payment confirmed — promote to "completed"
  const { error: updateError } = await supabaseAdmin
    .from("lead_purchases")
    .update({
      status: "completed",
      buyer_email: session.customer_details?.email ?? null,
      stripe_payment_intent_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", purchase.id);

  if (updateError) {
    console.error("verify-purchase: failed to update purchase:", updateError);
    return NextResponse.json(
      { error: "Failed to update purchase" },
      { status: 500 }
    );
  }

  // Mark the lead as no longer public
  await supabaseAdmin
    .from("vending_requests")
    .update({ is_public: false, status: "matched" })
    .eq("id", requestId);

  return NextResponse.json({ status: "completed" });
}
