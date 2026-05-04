import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { createAndSendAgreement } from "@/lib/locationAgreement";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSalesUser(req);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: itemId } = await params;

  console.log("[resend-agreement] Looking up pipeline item:", itemId);

  const { data: item, error: itemError } = await supabaseAdmin
    .from("pipeline_items")
    .select("id, name, location_id, lead_id, account_id")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError) {
    console.error("[resend-agreement] Pipeline item query error:", itemError.message);
    return NextResponse.json({ error: `Query failed: ${itemError.message}` }, { status: 500 });
  }

  if (!item) {
    return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
  }

  // Try to get contact info from location first
  let leadId: string | null = null;
  let contactEmail: string | null = null;
  let contactName: string | null = null;
  let businessName: string = item.name;
  let phone: string | null = null;
  let address: string | null = null;

  if (item.location_id) {
    const { data: loc } = await supabaseAdmin
      .from("locations")
      .select("id, sales_lead_id, location_name, decision_maker_name, decision_maker_email, phone, address")
      .eq("id", item.location_id)
      .maybeSingle();

    if (loc) {
      leadId = loc.sales_lead_id;
      contactEmail = loc.decision_maker_email;
      contactName = loc.decision_maker_name;
      businessName = loc.location_name || item.name;
      phone = loc.phone;
      address = loc.address;
    } else {
      console.warn("[resend-agreement] Location not found for id:", item.location_id, "— falling back to lead/account");
    }
  }

  // Fallback: use the sales lead linked to the pipeline item
  if (!leadId && item.lead_id) {
    const { data: lead } = await supabaseAdmin
      .from("sales_leads")
      .select("id, email, contact_name, business_name, phone, address")
      .eq("id", item.lead_id)
      .maybeSingle();

    if (lead) {
      leadId = lead.id;
      contactEmail = contactEmail || lead.email;
      contactName = contactName || lead.contact_name;
      businessName = lead.business_name || businessName;
      phone = phone || lead.phone;
      address = address || lead.address;
    }
  }

  // Fallback: use the sales account linked to the pipeline item
  if (!contactEmail && item.account_id) {
    const { data: account } = await supabaseAdmin
      .from("sales_accounts")
      .select("id, email, contact_name, business_name, phone, address")
      .eq("id", item.account_id)
      .maybeSingle();

    if (account) {
      contactEmail = account.email;
      contactName = contactName || account.contact_name;
      businessName = account.business_name || businessName;
      phone = phone || account.phone;
      address = address || account.address;
    }
  }

  // If we still don't have a lead_id, create the agreement under the pipeline item's lead
  if (!leadId && item.lead_id) {
    leadId = item.lead_id;
  }

  if (!leadId) {
    return NextResponse.json(
      { error: "No sales lead linked — create or link a location first" },
      { status: 422 }
    );
  }

  if (!contactEmail) {
    return NextResponse.json(
      { error: "No email found on location, lead, or account — add an email first" },
      { status: 422 }
    );
  }

  try {
    await createAndSendAgreement(
      leadId,
      {
        business_name: businessName,
        contact_name: contactName || undefined,
        email: contactEmail,
        phone: phone || undefined,
        address: address || undefined,
      },
      { force: true }
    );

    console.log("[resend-agreement] Agreement sent to", contactEmail);
    return NextResponse.json({ ok: true, sent_to: contactEmail });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[resend-agreement] Failed to send:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
