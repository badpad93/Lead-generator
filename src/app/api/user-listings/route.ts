import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_SELLER_ROLES = ["operator", "location_manager"];
const MIN_PRICE = 100;
const MAX_PRICE = 10000;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const state = params.get("state");
  const listingType = params.get("type");
  const sellerIdParam = params.get("seller_id");
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  const perPage = Math.min(50, Math.max(1, parseInt(params.get("per_page") || "20")));

  // "me" means fetch this user's own listings (all statuses)
  let resolvedSellerId: string | null = null;
  if (sellerIdParam === "me") {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (token) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      resolvedSellerId = user?.id || null;
    }
    if (!resolvedSellerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (sellerIdParam) {
    resolvedSellerId = sellerIdParam;
  }

  let query = supabaseAdmin
    .from("user_listings")
    .select("*, profiles!seller_id(full_name, company_name, city, state)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (resolvedSellerId && sellerIdParam === "me") {
    // Show all statuses for the owner (not just active/public)
    query = query.eq("seller_id", resolvedSellerId).neq("status", "removed");
  } else {
    query = query.eq("status", "active").eq("is_public", true);
    if (resolvedSellerId) query = query.eq("seller_id", resolvedSellerId);
  }

  if (state) query = query.eq("state", state);
  if (listingType) query = query.eq("listing_type", listingType);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ listings: data, total: count });
}

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
    .select("role, stripe_account_id, stripe_onboarding_complete")
    .eq("id", user.id)
    .single();

  if (!profile || !ALLOWED_SELLER_ROLES.includes(profile.role)) {
    return NextResponse.json(
      { error: "Only operators and location managers can create listings" },
      { status: 403 }
    );
  }

  if (!profile.stripe_account_id || !profile.stripe_onboarding_complete) {
    return NextResponse.json(
      { error: "You must connect your Stripe account before listing. Go to Profile → Connect Stripe." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const {
    title,
    description,
    listing_type,
    price,
    city,
    state,
    zip,
    entity_type,
    foot_traffic,
    square_footage,
    business_type,
    contact_name,
    contact_phone,
    contact_email,
  } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!listing_type || !["lead", "location", "route"].includes(listing_type)) {
    return NextResponse.json({ error: "Invalid listing type" }, { status: 400 });
  }
  if (!price || price < MIN_PRICE || price > MAX_PRICE) {
    return NextResponse.json(
      { error: `Price must be between $${MIN_PRICE} and $${MAX_PRICE.toLocaleString()}` },
      { status: 400 }
    );
  }
  if (!state?.trim()) {
    return NextResponse.json({ error: "State is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("user_listings")
    .insert({
      seller_id: user.id,
      title: title.trim(),
      description: description?.trim() || null,
      listing_type,
      price,
      city: city?.trim() || null,
      state: state.trim(),
      zip: zip?.trim() || null,
      entity_type: entity_type || null,
      foot_traffic: foot_traffic || null,
      square_footage: square_footage || null,
      business_type: business_type || null,
      contact_name: contact_name?.trim() || null,
      contact_phone: contact_phone?.trim() || null,
      contact_email: contact_email?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
