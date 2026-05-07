import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_ROLES = ["operator", "location_manager", "admin", "director_of_sales", "market_leader", "sales"];

export async function POST(req: NextRequest) {
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
    .select("role, stripe_account_id, stripe_onboarding_complete, email, full_name")
    .eq("id", user.id)
    .single();

  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    return NextResponse.json(
      { error: "Only operators and location managers can sell on the marketplace" },
      { status: 403 }
    );
  }

  const stripe = new Stripe(process.env.STRIPE_CONNECT_SECRET_KEY!);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";

  let accountId = profile.stripe_account_id;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: profile.email || user.email || undefined,
      metadata: { user_id: user.id },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        name: profile.full_name || undefined,
      },
    });
    accountId = account.id;

    await supabaseAdmin
      .from("profiles")
      .update({ stripe_account_id: accountId })
      .eq("id", user.id);
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${siteUrl}/dashboard/profile?stripe=refresh`,
    return_url: `${siteUrl}/dashboard/profile?stripe=complete`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}
