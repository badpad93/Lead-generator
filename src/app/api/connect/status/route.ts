import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_account_id, stripe_onboarding_complete")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_account_id) {
    return NextResponse.json({
      connected: false,
      onboarding_complete: false,
      charges_enabled: false,
      payouts_enabled: false,
    });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const account = await stripe.accounts.retrieve(profile.stripe_account_id);
  const onboardingComplete = account.charges_enabled && account.payouts_enabled;

  if (onboardingComplete && !profile.stripe_onboarding_complete) {
    await supabaseAdmin
      .from("profiles")
      .update({ stripe_onboarding_complete: true })
      .eq("id", user.id);
  }

  return NextResponse.json({
    connected: true,
    onboarding_complete: onboardingComplete,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
  });
}
