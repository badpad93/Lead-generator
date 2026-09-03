import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { sendCoffeeApplicationNotification, sendCoffeeApprovalEmail } from "@/lib/coffeeEmail";

/**
 * Coffee application — SELF-SERVE, auto-approved.
 *
 * Applications used to insert as status='pending' and wait on an
 * admin PATCH in /api/admin/coffee/applications; operators trying
 * to order coffee were stranded on an "Application Under Review"
 * screen. Per product direction, no review step: submitting the
 * application immediately grants marketplace access
 * (coffee_access_enabled). The Equipment Loan & Beverage Supply
 * Agreement stays a real, separate signing step — auto-approval
 * does NOT fake coffee_agreement_signed; the marketplace's sign
 * banner still drives that.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const nowIso = new Date().toISOString();

    const { data: application, error } = await supabaseAdmin
      .from("coffee_applications")
      .insert({
        operator_id: userId,
        business_name: body.business_name ?? null,
        contact_name: body.contact_name ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        shipping_address: body.shipping_address ?? null,
        shipping_city: body.shipping_city ?? null,
        shipping_state: body.shipping_state ?? null,
        shipping_zip: body.shipping_zip ?? null,
        num_locations: body.num_locations ?? null,
        existing_machines: body.existing_machines ?? null,
        estimated_volume: body.estimated_volume ?? null,
        notes: body.notes ?? null,
        agreement_signed: body.agreement_signed ?? false,
        agreement_signed_at: body.agreement_signed ? nowIso : null,
        // Self-approved at submission — reviewed_by stays null so
        // the admin console can distinguish auto-approvals from
        // human reviews.
        status: "approved",
        reviewed_at: nowIso,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseAdmin
      .from("profiles")
      .update({
        coffee_application_status: "approved",
        coffee_access_enabled: true,
      })
      .eq("id", userId);

    // Notify admins that someone joined the program (informational,
    // not a review request) + welcome the applicant with the same
    // approval email the admin path sent.
    try {
      await sendCoffeeApplicationNotification({
        businessName: body.business_name || "Unknown",
        contactName: body.contact_name || "Unknown",
        email: body.email || "",
        phone: body.phone,
        numLocations: body.num_locations,
        existingMachines: body.existing_machines,
        estimatedVolume: body.estimated_volume,
      });
    } catch {
      // Email failure should not block the application
    }
    try {
      if (body.email) {
        await sendCoffeeApprovalEmail({
          to: body.email,
          contactName: body.contact_name || "",
          businessName: body.business_name || "",
        });
      }
    } catch {
      // Email failure should not block the application
    }

    return NextResponse.json({ application, approved: true }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
