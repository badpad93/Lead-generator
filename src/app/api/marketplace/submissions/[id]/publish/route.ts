import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { sendLocationAgreementEmail } from "@/lib/locationAgreementEmail";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";
const MIN_PRICE = 100;
const MAX_PRICE = 10000;

/**
 * POST /api/marketplace/submissions/[id]/publish
 *
 * Publish a rejected placement submission to the public marketplace as a
 * location listing. Salvages the PP's work when an operator declines a
 * candidate location.
 *
 * GATES
 *   - Caller must be a Placement Partner (getPlacementPartner).
 *   - Caller must own the submission (partner_id === caller.id).
 *   - Submission must have operator_status === 'rejected' — the whole point.
 *   - Submission must not already have a public_listing_id (idempotent).
 *
 * PRIVACY (mirrors /api/sales/leads/[id]/publish)
 *   - decision_maker_email/name are used ONLY to send the location-owner
 *     verification email; they are NOT written to user_listings.contact_*.
 *   - owner_name / owner_email ARE stored on the listing (verification link
 *     uses them). Public GET on user_listings redacts them.
 *   - Operator identity from the source contract is NEVER referenced —
 *     nothing about the contract flows into the public listing. The listing
 *     stands on its own.
 *
 * Body
 *   description        — REQUIRED, min 40 chars
 *   price              — REQUIRED, 100–10000
 *   title              — optional, defaults to submission.business_name
 *   entity_type, foot_traffic, square_footage, business_type — optional
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();
  const { id } = await params;

  const { data: submission } = await supabaseAdmin
    .from("placement_submissions")
    .select("id, partner_id, business_name, address, city, state, zip, industry, employees, decision_maker_name, decision_maker_email, operator_status, public_listing_id")
    .eq("id", id)
    .maybeSingle();
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

  if (submission.partner_id !== user.id) return forbidden();

  if (submission.operator_status !== "rejected") {
    return NextResponse.json(
      { error: "Only submissions rejected by the operator can be published to the public marketplace." },
      { status: 400 },
    );
  }

  if (submission.public_listing_id) {
    return NextResponse.json(
      { error: "This submission is already listed publicly.", listing_id: submission.public_listing_id },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const priceRaw = Number(body.price);
  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim()
    : (submission.business_name || `Location in ${submission.state || "US"}`);

  if (!description) return NextResponse.json({ error: "Description is required" }, { status: 400 });
  if (description.length < 40) {
    return NextResponse.json({ error: "Description must be at least 40 characters" }, { status: 400 });
  }
  if (!Number.isFinite(priceRaw) || priceRaw < MIN_PRICE || priceRaw > MAX_PRICE) {
    return NextResponse.json(
      { error: `Price must be between $${MIN_PRICE} and $${MAX_PRICE.toLocaleString()}` },
      { status: 400 },
    );
  }
  if (!submission.state) {
    return NextResponse.json({ error: "Submission has no state on file; cannot publish." }, { status: 400 });
  }
  if (!submission.decision_maker_email || !submission.decision_maker_name) {
    return NextResponse.json({
      error: "Submission is missing the decision maker's name or email — those are required to send the owner verification link. Update the submission first.",
    }, { status: 400 });
  }

  const { data: listing, error: listingErr } = await supabaseAdmin
    .from("user_listings")
    .insert({
      seller_id: user.id,
      source_submission_id: submission.id,
      title,
      description,
      listing_type: "location",
      price: priceRaw,
      city: submission.city || null,
      state: submission.state,
      zip: submission.zip || null,
      entity_type: body.entity_type || null,
      foot_traffic: body.foot_traffic || null,
      square_footage: body.square_footage || null,
      business_type: body.business_type || submission.industry || null,
      contact_name: null,
      contact_phone: null,
      contact_email: null,
      owner_name: submission.decision_maker_name,
      owner_email: submission.decision_maker_email.toLowerCase(),
      status: "pending_verification",
      is_public: false,
    })
    .select("*")
    .single();
  if (listingErr) return NextResponse.json({ error: listingErr.message }, { status: 500 });

  try {
    const { data: agreement } = await supabaseAdmin
      .from("location_agreements")
      .insert({
        listing_id: listing.id,
        business_name: title,
        contact_name: submission.decision_maker_name,
        email: submission.decision_maker_email.toLowerCase(),
        address: [submission.city, submission.state, submission.zip].filter(Boolean).join(", ") || submission.address || null,
      })
      .select("token")
      .single();

    if (agreement) {
      await sendLocationAgreementEmail({
        to: submission.decision_maker_email.toLowerCase(),
        recipientName: submission.decision_maker_name,
        businessName: title,
        agreementUrl: `${APP_URL}/location-agreement/${agreement.token}`,
      });
    }
  } catch (emailErr) {
    console.error("[submissions.publish] verification email failed:", emailErr);
  }

  await supabaseAdmin
    .from("placement_submissions")
    .update({ public_listing_id: listing.id })
    .eq("id", submission.id);

  await supabaseAdmin.from("placement_submission_activity").insert({
    submission_id: submission.id,
    actor_id: user.id,
    activity_type: "published_to_marketplace",
    description: `Published to public marketplace as ${title}`,
  });

  return NextResponse.json({ ok: true, listing_id: listing.id, status: listing.status });
}
