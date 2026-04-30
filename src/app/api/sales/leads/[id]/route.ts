import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";
import { sendLeadAssignmentEmail } from "@/lib/email";
import { sendLocationAgreementEmail } from "@/lib/locationAgreementEmail";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";

async function createAndSendAgreement(leadId: string, lead: { business_name?: string; contact_name?: string; email?: string; phone?: string; address?: string; title_role?: string }) {
  if (!lead.email) return;

  const existing = await supabaseAdmin
    .from("location_agreements")
    .select("id")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (existing.data) return;

  const { data: agreement } = await supabaseAdmin
    .from("location_agreements")
    .insert({
      lead_id: leadId,
      business_name: lead.business_name || null,
      contact_name: lead.contact_name || null,
      email: lead.email,
      phone: lead.phone || null,
      address: lead.address || null,
    })
    .select("token")
    .single();

  if (!agreement) return;

  await sendLocationAgreementEmail({
    to: lead.email,
    recipientName: lead.contact_name || "Business Owner",
    businessName: lead.business_name || "your location",
    agreementUrl: `${APP_URL}/location-agreement/${agreement.token}`,
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("sales_leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  let assigned_profile = null;
  if (data?.assigned_to) {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", data.assigned_to)
      .single();
    assigned_profile = prof || null;
  }
  return NextResponse.json({ ...data, assigned_profile });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const allowed = [
    "business_name",
    "contact_name",
    "phone",
    "email",
    "address",
    "city",
    "state",
    "status",
    "source",
    "notes",
    "do_not_call",
    "urgent",
    "entity_type",
    "immediate_need",
    "last_contacted_at",
    "next_followup_at",
    "account_id",
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if ("assigned_to" in body) {
    if (!isElevatedRole(user.role)) {
      return NextResponse.json({ error: "Only admin can assign leads" }, { status: 403 });
    }
    updates.assigned_to = body.assigned_to;
  }

  const { data, error } = await supabaseAdmin
    .from("sales_leads")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync shared fields to the linked account
  const ACCOUNT_SYNC_FIELDS = ["business_name", "contact_name", "phone", "email", "address", "entity_type"];
  const accountUpdates: Record<string, unknown> = {};
  for (const key of ACCOUNT_SYNC_FIELDS) {
    if (key in updates) accountUpdates[key] = updates[key];
  }
  if (data.account_id && Object.keys(accountUpdates).length > 0) {
    await supabaseAdmin
      .from("sales_accounts")
      .update(accountUpdates)
      .eq("id", data.account_id);
  }

  if ("assigned_to" in body && body.assigned_to) {
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email")
        .eq("id", body.assigned_to)
        .single();

      if (profile?.email) {
        await sendLeadAssignmentEmail({
          to: profile.email,
          assigneeName: profile.full_name || "",
          leads: [{
            business_name: data.business_name,
            contact_name: data.contact_name,
            phone: data.phone,
            email: data.email,
            city: data.city,
            state: data.state,
          }],
        });
      }
    } catch (err) {
      console.error("[leads] Failed to send assignment email:", err instanceof Error ? err.message : err);
    }
  }

  if (updates.status === "qualified") {
    try {
      await createAndSendAgreement(id, data);
    } catch (err) {
      console.error("[leads] Failed to send location agreement:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json(data);
}

/** POST to claim a lead (sales user) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  if (body.action === "claim") {
    // Check if already assigned
    const { data: lead } = await supabaseAdmin
      .from("sales_leads")
      .select("assigned_to")
      .eq("id", id)
      .single();

    if (lead?.assigned_to) {
      return NextResponse.json({ error: "Lead already assigned" }, { status: 400 });
    }

    const { data: updatedLead, error } = await supabaseAdmin
      .from("sales_leads")
      .update({ assigned_to: user.id })
      .eq("id", id)
      .select("business_name, contact_name, phone, email, city, state")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single();

      if (profile?.email && updatedLead) {
        await sendLeadAssignmentEmail({
          to: profile.email,
          assigneeName: profile.full_name || "",
          leads: [{
            business_name: updatedLead.business_name,
            contact_name: updatedLead.contact_name,
            phone: updatedLead.phone,
            email: updatedLead.email,
            city: updatedLead.city,
            state: updatedLead.state,
          }],
        });
      }
    } catch (err) {
      console.error("[leads] Failed to send claim email:", err instanceof Error ? err.message : err);
    }

    return NextResponse.json({ ok: true });
  }

  if (body.action === "convert") {
    // Convert lead to deal
    const { data: lead } = await supabaseAdmin
      .from("sales_leads")
      .select("*")
      .eq("id", id)
      .single();

    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const { data: deal, error } = await supabaseAdmin
      .from("sales_deals")
      .insert({
        lead_id: id,
        assigned_to: lead.assigned_to || user.id,
        stage: "new",
        value: 0,
        business_name: lead.business_name,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mark lead as qualified
    await supabaseAdmin.from("sales_leads").update({ status: "qualified" }).eq("id", id);

    try {
      await createAndSendAgreement(id, lead);
    } catch (err) {
      console.error("[leads] Failed to send location agreement:", err instanceof Error ? err.message : err);
    }

    return NextResponse.json({ dealId: deal.id }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  if (!isElevatedRole(user.role)) {
    const { data: lead } = await supabaseAdmin
      .from("sales_leads")
      .select("assigned_to, created_by")
      .eq("id", id)
      .single();
    if (!lead || (lead.assigned_to !== user.id && lead.created_by !== user.id)) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }

  // Detach related records so FK constraints don't block deletion.
  // Activity log rows cascade automatically.
  await supabaseAdmin.from("location_agreements").update({ lead_id: null }).eq("lead_id", id);
  await supabaseAdmin.from("sales_deals").update({ lead_id: null }).eq("lead_id", id);

  const { error } = await supabaseAdmin.from("sales_leads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
