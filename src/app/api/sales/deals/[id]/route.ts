import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { validateStageTransition } from "@/lib/dealValidation";
import type { DealStage } from "@/lib/salesTypes";

const DEFAULT_COMMISSION_RATE = 0.10;

const DEFAULT_FULFILLMENT_ITEMS = [
  "Confirm customer contact info",
  "Send welcome / onboarding email",
  "Schedule setup or delivery",
  "Verify payment received",
  "Complete service delivery",
  "Follow-up satisfaction check",
];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("sales_deals")
    .select("*, deal_services(*)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  // Fetch current deal with services
  const { data: deal, error: dealErr } = await supabaseAdmin
    .from("sales_deals")
    .select("*, deal_services(*), sales_leads:lead_id(*)")
    .eq("id", id)
    .single();

  if (dealErr || !deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // Deal locking: reject edits to won/lost deals (admin can unlock)
  if (deal.locked_at && user.role !== "admin") {
    return NextResponse.json(
      { error: "This deal is locked. Only admins can modify won or lost deals." },
      { status: 403 }
    );
  }

  const allowed = ["stage", "value", "business_name", "account_id"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // Stage validation gates
  if (body.stage && body.stage !== deal.stage) {
    const newStage = body.stage as DealStage;
    const validation = validateStageTransition(deal, newStage);

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.errors.join(". "), validation_errors: validation.errors },
        { status: 422 }
      );
    }

    // Lock deal when moving to won or lost
    if (newStage === "won" || newStage === "lost") {
      updates.locked_at = new Date().toISOString();
    }
  }

  // If stage → won, auto-create account + order + commission
  if (body.stage === "won" && deal.stage !== "won") {
    const lead = deal.sales_leads;

    // Auto-create account if none exists
    if (!deal.account_id) {
      const { data: account } = await supabaseAdmin
        .from("sales_accounts")
        .insert({
          business_name: deal.business_name,
          contact_name: lead?.contact_name || null,
          phone: lead?.phone || null,
          email: lead?.email || null,
          address: lead?.address || null,
        })
        .select("id")
        .single();

      if (account) {
        updates.account_id = account.id;
      }
    }

    // Auto-create order from deal services
    const services = deal.deal_services || [];
    if (services.length > 0) {
      const total = services.reduce((sum: number, s: { price: number }) => sum + Number(s.price), 0);
      const recipientEmail = lead?.email || deal.sales_leads?.email || "james@apexaivending.com";

      const { data: order } = await supabaseAdmin
        .from("sales_orders")
        .insert({
          deal_id: id,
          account_id: (updates.account_id as string) || deal.account_id || null,
          created_by: user.id,
          total_value: total,
          status: "draft",
          recipient_email: recipientEmail,
          notes: `Auto-created from deal: ${deal.business_name}`,
        })
        .select("id")
        .single();

      if (order) {
        const orderItems = services.map((s: { service_name: string; price: number }) => ({
          order_id: order.id,
          service_name: s.service_name,
          price: s.price,
          notes: null,
        }));
        await supabaseAdmin.from("order_items").insert(orderItems);

        // Create fulfillment checklist for the order
        const checklistItems = DEFAULT_FULFILLMENT_ITEMS.map((label, i) => ({
          order_id: order.id,
          label,
          sort_order: i,
        }));
        await supabaseAdmin.from("fulfillment_items").insert(checklistItems);
      }

      // Create commission record for the assigned rep
      const repId = deal.assigned_to;
      if (repId) {
        const commissionAmount = total * DEFAULT_COMMISSION_RATE;
        await supabaseAdmin.from("sales_commissions").insert({
          deal_id: id,
          order_id: order?.id || null,
          user_id: repId,
          commission_rate: DEFAULT_COMMISSION_RATE,
          deal_value: total,
          commission_amount: commissionAmount,
          status: "pending",
        });
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from("sales_deals")
    .update(updates)
    .eq("id", id)
    .select("*, deal_services(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  if (user.role !== "admin") {
    const { data: deal } = await supabaseAdmin
      .from("sales_deals")
      .select("assigned_to")
      .eq("id", id)
      .single();
    if (!deal || deal.assigned_to !== user.id) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }

  // Detach orders so the FK doesn't block deletion
  await supabaseAdmin.from("sales_orders").update({ deal_id: null }).eq("deal_id", id);

  const { error } = await supabaseAdmin.from("sales_deals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
