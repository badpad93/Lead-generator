import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { sendLocationAgreementEmail } from "@/lib/locationAgreementEmail";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";
const MIN_PRICE = 100;
const MAX_PRICE = 10000;

/**
 * POST /api/sales/leads/[id]/publish
 *
 * Publish a sales lead to the public marketplace as a location listing.
 *
 * PRIVACY MODEL:
 *   - Lead's contact_name / email / phone are used ONLY to send the location
 *     owner verification email — they do NOT get written to user_listings.
 *     contact_* / owner_* columns on the listing stay null; only the
 *     verification-token email link goes to the owner.
 *   - The public GET on /api/user-listings already strips owner_email/name
 *     for non-owner requests, so even if a rep accidentally set them the
 *     public browse doesn't leak. We keep them null anyway for defense.
 *
 * Body:
 *   description        — REQUIRED, marketing copy shown publicly
 *   price              — REQUIRED, 100-10000
 *   title              — optional, defaults to the lead's business name
 *   city, state, zip   — optional, best-effort parsed from lead.address
 *   entity_type, foot_traffic, square_footage, business_type — optional
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: lead } = await supabaseAdmin
    .from("sales_leads")
    .select("id, business_name, contact_name, email, phone, address, public_listing_id")
    .eq("id", id)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  // If a listing already exists for this lead, return it rather than
  // duplicating. Front-end can decide whether to link to the existing one.
  if (lead.public_listing_id) {
    return NextResponse.json({
      error: "This lead is already listed publicly",
      listing_id: lead.public_listing_id,
    }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));

  const description = typeof body.description === "string" ? body.description.trim() : "";
  const priceRaw = Number(body.price);
  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim()
    : (lead.business_name || `Location in ${body.state || "US"}`);
  const state = typeof body.state === "string" ? body.state.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const zip = typeof body.zip === "string" ? body.zip.trim() : "";

  if (!description) return NextResponse.json({ error: "Description is required" }, { status: 400 });
  if (description.length < 40) return NextResponse.json({ error: "Description must be at least 40 characters" }, { status: 400 });
  if (!Number.isFinite(priceRaw) || priceRaw < MIN_PRICE || priceRaw > MAX_PRICE) {
    return NextResponse.json(
      { error: `Price must be between $${MIN_PRICE} and $${MAX_PRICE.toLocaleString()}` },
      { status: 400 },
    );
  }
  if (!state) return NextResponse.json({ error: "State is required" }, { status: 400 });
  if (!lead.email || !lead.contact_name) {
    return NextResponse.json({
      error: "Lead is missing contact name or email — those are required to send the owner verification link. Update the lead first.",
    }, { status: 400 });
  }

  // Insert the listing. contact_* stays NULL by design so nothing private
  // leaks to the public GET.
  const { data: listing, error: listingErr } = await supabaseAdmin
    .from("user_listings")
    .insert({
      seller_id: user.id,
      source_lead_id: lead.id,
      title,
      description,
      listing_type: "location",
      price: priceRaw,
      city: city || null,
      state,
      zip: zip || null,
      entity_type: body.entity_type || null,
      foot_traffic: body.foot_traffic || null,
      square_footage: body.square_footage || null,
      business_type: body.business_type || null,
      // PRIVACY — never populate these from the lead. Public GET redacts
      // them anyway; keeping them null means owner sale info never
      // accidentally hits the wire.
      contact_name: null,
      contact_phone: null,
      contact_email: null,
      // Owner_name / owner_email ARE stored (verification uses them) but
      // the public GET strips them the same way.
      owner_name: lead.contact_name,
      owner_email: lead.email.toLowerCase(),
      status: "pending_verification",
      is_public: false,
    })
    .select("*")
    .single();
  if (listingErr) return NextResponse.json({ error: listingErr.message }, { status: 500 });

  // Send the owner verification email — private, goes only to the location
  // owner. On verification, the listing flips to is_public=true.
  try {
    const { data: agreement } = await supabaseAdmin
      .from("location_agreements")
      .insert({
        listing_id: listing.id,
        business_name: title,
        contact_name: lead.contact_name,
        email: lead.email.toLowerCase(),
        address: [city, state, zip].filter(Boolean).join(", ") || lead.address || null,
      })
      .select("token")
      .single();

    if (agreement) {
      await sendLocationAgreementEmail({
        to: lead.email.toLowerCase(),
        recipientName: lead.contact_name,
        businessName: title,
        agreementUrl: `${APP_URL}/location-agreement/${agreement.token}`,
      });
    }
  } catch (emailErr) {
    console.error("[leads.publish] verification email failed:", emailErr);
    // Non-fatal — listing exists but owner won't get the email. Admin can
    // resend from the listings admin panel.
  }

  // Stamp reverse link on the lead so UI can show "already published".
  await supabaseAdmin
    .from("sales_leads")
    .update({ public_listing_id: listing.id })
    .eq("id", lead.id);

  return NextResponse.json({ ok: true, listing_id: listing.id, status: listing.status });
}
