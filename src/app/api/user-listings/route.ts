import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { sendLocationAgreementEmail } from "@/lib/locationAgreementEmail";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";

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

  let resolvedSellerId: string | null = null;
  if (sellerIdParam === "me") {
    resolvedSellerId = await getUserIdFromRequest(req);
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

  const isOwnerQuery = resolvedSellerId && sellerIdParam === "me";
  const listings = isOwnerQuery
    ? data
    : (data || []).map((listing: Record<string, unknown>) => {
        const { contact_name: _cn, contact_phone: _cp, contact_email: _ce, owner_name: _on, owner_email: _oe, ...safe } = listing;
        return safe;
      });

  return NextResponse.json({ listings, total: count });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, stripe_account_id, stripe_onboarding_complete")
    .eq("id", userId)
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
    owner_name,
    owner_email,
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
  if (!owner_name?.trim() || !owner_email?.trim()) {
    return NextResponse.json(
      { error: "Location owner name and email are required for verification" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("user_listings")
    .insert({
      seller_id: userId,
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
      owner_name: owner_name.trim(),
      owner_email: owner_email.trim().toLowerCase(),
      status: "pending_verification",
      is_public: false,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Create location agreement and send verification email to the location owner
  try {
    const { data: agreement } = await supabaseAdmin
      .from("location_agreements")
      .insert({
        listing_id: data.id,
        business_name: title.trim(),
        contact_name: owner_name.trim(),
        email: owner_email.trim().toLowerCase(),
        address: [city?.trim(), state.trim(), zip?.trim()].filter(Boolean).join(", ") || null,
      })
      .select("token")
      .single();

    if (agreement) {
      await sendLocationAgreementEmail({
        to: owner_email.trim().toLowerCase(),
        recipientName: owner_name.trim(),
        businessName: title.trim(),
        agreementUrl: `${APP_URL}/location-agreement/${agreement.token}`,
      });
    }
  } catch (emailErr) {
    console.error("[user-listings] Failed to send verification email:", emailErr);
  }

  return NextResponse.json(data, { status: 201 });
}
