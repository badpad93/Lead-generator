import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createInvoice, sendInvoiceEmail, getInvoice } from "@/lib/quickbooks";

const PLATFORM_FEE_RATE = 0.15;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  const { data: listing } = await supabaseAdmin
    .from("user_listings")
    .select("*")
    .eq("id", id)
    .eq("status", "active")
    .eq("is_public", true)
    .single();

  if (!listing) {
    return NextResponse.json({ error: "Listing not found or no longer available" }, { status: 404 });
  }

  if (listing.seller_id === user.id) {
    return NextResponse.json({ error: "You cannot purchase your own listing" }, { status: 400 });
  }

  const { data: existingPurchase } = await supabaseAdmin
    .from("user_listing_purchases")
    .select("id")
    .eq("listing_id", id)
    .eq("status", "completed")
    .maybeSingle();

  if (existingPurchase) {
    return NextResponse.json({ error: "This listing has already been sold" }, { status: 409 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
  const amountCents = Math.round(Number(listing.price) * 100);
  const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);
  const typeLabel = listing.listing_type === "lead" ? "Vending Lead" : listing.listing_type === "location" ? "Location" : "Route";

  try {
    const invoice = await createInvoice({
      customerEmail: user.email || "",
      customerName: user.user_metadata?.full_name || user.email || "Buyer",
      lineItems: [
        {
          description: `${typeLabel} — ${listing.title} (${listing.city || ""}, ${listing.state})`.trim(),
          amount: amountCents / 100,
        },
      ],
      memo: `Marketplace purchase — ${listing.title}`,
      metadata: {
        type: "marketplace_purchase",
        listing_id: listing.id,
        buyer_id: user.id,
        seller_id: listing.seller_id,
      },
    });

    await supabaseAdmin.from("user_listing_purchases").insert({
      listing_id: listing.id,
      buyer_id: user.id,
      seller_id: listing.seller_id,
      amount_cents: amountCents,
      platform_fee_cents: platformFeeCents,
      seller_payout_cents: amountCents - platformFeeCents,
      qb_invoice_id: invoice.Id,
      payment_provider: "quickbooks",
      status: "pending",
      payout_status: "pending",
    });

    // Notify seller their listing was purchased
    try {
      const { data: sellerProfile } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", listing.seller_id)
        .single();

      if (sellerProfile?.email) {
        const { sendListingPurchasedEmail } = await import("@/lib/locationAgreementEmail");
        await sendListingPurchasedEmail({
          to: sellerProfile.email,
          sellerName: sellerProfile.full_name || "Seller",
          listingTitle: listing.title,
          buyerName: user.user_metadata?.full_name || user.email || "A buyer",
          amount: Number(listing.price),
        });
      }
    } catch {
      // Seller notification is best-effort
    }

    await sendInvoiceEmail(invoice.Id, user.email || undefined);

    const fullInvoice = await getInvoice(invoice.Id);
    if (fullInvoice.InvoiceLink) {
      return NextResponse.json({ url: fullInvoice.InvoiceLink });
    }

    return NextResponse.json({
      url: `${siteUrl}/marketplace/${listing.id}?invoice_sent=true`,
      invoiceSent: true,
      invoiceId: invoice.Id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment error";
    console.error("[marketplace-checkout] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
