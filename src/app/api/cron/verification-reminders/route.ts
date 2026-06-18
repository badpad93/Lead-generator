import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendLocationAgreementEmail, sendListingExpiredEmail } from "@/lib/locationAgreementEmail";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  if (CRON_SECRET && req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let reminded = 0;
  let expired = 0;

  // 1. Expire unsigned agreements older than 7 days
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: expiredAgreements } = await supabaseAdmin
    .from("location_agreements")
    .select("id, listing_id")
    .in("status", ["pending", "viewed"])
    .not("listing_id", "is", null)
    .lt("created_at", sevenDaysAgo);

  if (expiredAgreements && expiredAgreements.length > 0) {
    const agreementIds = expiredAgreements.map((a) => a.id);
    const listingIds = expiredAgreements.map((a) => a.listing_id).filter(Boolean) as string[];

    await supabaseAdmin
      .from("location_agreements")
      .update({ status: "expired", updated_at: now.toISOString() })
      .in("id", agreementIds);

    if (listingIds.length > 0) {
      await supabaseAdmin
        .from("user_listings")
        .update({ status: "expired", is_public: false, updated_at: now.toISOString() })
        .in("id", listingIds)
        .eq("status", "pending_verification");

      // Notify sellers their listings expired
      const { data: expiredListings } = await supabaseAdmin
        .from("user_listings")
        .select("title, seller_id, profiles!seller_id(email, full_name)")
        .in("id", listingIds);

      if (expiredListings) {
        for (const listing of expiredListings) {
          const sellerProfile = listing.profiles as unknown as { email: string; full_name: string } | null;
          if (sellerProfile?.email) {
            try {
              await sendListingExpiredEmail({
                to: sellerProfile.email,
                sellerName: sellerProfile.full_name || "Seller",
                listingTitle: listing.title,
              });
            } catch (err) {
              console.error(`[cron] Failed to send expiry email for listing:`, err);
            }
          }
        }
      }
    }

    expired = expiredAgreements.length;
  }

  // 2. Send 24h reminder (created 24-25h ago, no reminder yet)
  const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: reminders24 } = await supabaseAdmin
    .from("location_agreements")
    .select("id, token, email, contact_name, business_name")
    .in("status", ["pending", "viewed"])
    .not("listing_id", "is", null)
    .is("reminder_sent_at", null)
    .lt("created_at", twentyFourHoursAgo)
    .gt("created_at", twentyFiveHoursAgo);

  // 3. Send 72h reminder (created 72-73h ago, already got 24h reminder)
  const seventyThreeHoursAgo = new Date(now.getTime() - 73 * 60 * 60 * 1000).toISOString();
  const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
  const { data: reminders72 } = await supabaseAdmin
    .from("location_agreements")
    .select("id, token, email, contact_name, business_name")
    .in("status", ["pending", "viewed"])
    .not("listing_id", "is", null)
    .not("reminder_sent_at", "is", null)
    .lt("created_at", seventyTwoHoursAgo)
    .gt("created_at", seventyThreeHoursAgo);

  const allReminders = [...(reminders24 || []), ...(reminders72 || [])];

  for (const agreement of allReminders) {
    if (!agreement.email) continue;
    try {
      await sendLocationAgreementEmail({
        to: agreement.email,
        recipientName: agreement.contact_name || "Business Owner",
        businessName: agreement.business_name || "your location",
        agreementUrl: `${APP_URL}/location-agreement/${agreement.token}`,
      });
      await supabaseAdmin
        .from("location_agreements")
        .update({ reminder_sent_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", agreement.id);
      reminded++;
    } catch (err) {
      console.error(`[cron] Failed to send reminder for agreement ${agreement.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, reminded, expired });
}
