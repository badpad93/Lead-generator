import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: leadId } = await params;
  const body = await req.json();
  const { pipeline_id } = body;

  if (!pipeline_id) return NextResponse.json({ error: "pipeline_id required" }, { status: 400 });

  // Fetch lead
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("sales_leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  // Create or find account
  let accountId = lead.account_id;
  if (!accountId) {
    const { data: existingAccount } = await supabaseAdmin
      .from("sales_accounts")
      .select("id")
      .eq("email", lead.email)
      .maybeSingle();

    if (existingAccount) {
      accountId = existingAccount.id;
    } else {
      const { data: newAccount } = await supabaseAdmin
        .from("sales_accounts")
        .insert({
          business_name: lead.business_name,
          contact_name: lead.contact_name,
          email: lead.email,
          phone: lead.phone,
          address: lead.address,
        })
        .select("id")
        .single();
      accountId = newAccount?.id || null;
    }
  }

  // Get pipeline + first step
  const { data: pipeline } = await supabaseAdmin
    .from("pipelines")
    .select("id, type")
    .eq("id", pipeline_id)
    .single();

  const { data: firstStep } = await supabaseAdmin
    .from("pipeline_steps")
    .select("id")
    .eq("pipeline_id", pipeline_id)
    .order("order_index")
    .limit(1)
    .maybeSingle();

  // Auto-create a deal for sales-type pipelines so the converted lead
  // shows up on the Deals page.
  let dealId: string | null = null;
  if (pipeline?.type === "sales") {
    const { data: deal } = await supabaseAdmin
      .from("sales_deals")
      .insert({
        business_name: lead.business_name || lead.contact_name || "Converted Lead",
        assigned_to: lead.assigned_to || user.id,
        stage: "new",
        value: 0,
        lead_id: leadId,
        account_id: accountId,
        pipeline_id,
        immediate_need: lead.immediate_need || null,
      })
      .select("id")
      .single();
    if (deal) dealId = deal.id;
  }

  // Create pipeline item
  const { data: pipelineItem, error: piErr } = await supabaseAdmin
    .from("pipeline_items")
    .insert({
      pipeline_id,
      account_id: accountId,
      lead_id: leadId,
      name: lead.business_name || lead.contact_name || "Converted Lead",
      status: "active",
      current_step_id: firstStep?.id || null,
      assigned_to: lead.assigned_to || user.id,
      deal_id: dealId,
    })
    .select("id")
    .single();

  if (piErr) return NextResponse.json({ error: piErr.message }, { status: 500 });

  // Link the deal back to the pipeline item
  if (dealId) {
    await supabaseAdmin.from("sales_deals").update({ pipeline_item_id: pipelineItem.id }).eq("id", dealId);
  }

  // Archive lead (mark as qualified)
  await supabaseAdmin
    .from("sales_leads")
    .update({ status: "qualified", account_id: accountId })
    .eq("id", leadId);

  return NextResponse.json({
    success: true,
    pipeline_item_id: pipelineItem.id,
    account_id: accountId,
    deal_id: dealId,
  }, { status: 201 });
}
