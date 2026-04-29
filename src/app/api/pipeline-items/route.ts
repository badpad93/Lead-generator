import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { filterByRole } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const pipelineId = url.searchParams.get("pipeline_id");
  const status = url.searchParams.get("status");

  let query = supabaseAdmin
    .from("pipeline_items")
    .select("*, pipelines(id, name), pipeline_steps!pipeline_items_current_step_id_fkey(id, name, order_index), sales_accounts(business_name), employees(full_name)")
    .order("created_at", { ascending: false });

  if (pipelineId) query = query.eq("pipeline_id", pipelineId);
  if (status) query = query.eq("status", status);

  query = await filterByRole(query, user, { creatorCol: "assigned_to" }) as typeof query;

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { pipeline_id, account_id, employee_id, lead_id, name, value, notes, assigned_to } = body;

  if (!pipeline_id || !name) {
    return NextResponse.json({ error: "pipeline_id and name required" }, { status: 400 });
  }

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

  // Auto-create a deal for sales-type pipelines
  let dealId: string | null = null;
  if (pipeline?.type === "sales") {
    const { data: deal } = await supabaseAdmin
      .from("sales_deals")
      .insert({
        business_name: name,
        assigned_to: assigned_to || user.id,
        stage: "new",
        value: value || 0,
        lead_id: lead_id || null,
        account_id: account_id || null,
        pipeline_id: pipeline_id,
      })
      .select("id")
      .single();
    if (deal) dealId = deal.id;
  }

  const { data, error } = await supabaseAdmin
    .from("pipeline_items")
    .insert({
      pipeline_id,
      account_id: account_id || null,
      employee_id: employee_id || null,
      lead_id: lead_id || null,
      name,
      status: "active",
      current_step_id: firstStep?.id || null,
      value: value || 0,
      notes: notes || null,
      assigned_to: assigned_to || user.id,
      deal_id: dealId,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Link the deal back to the pipeline item
  if (dealId && data) {
    await supabaseAdmin.from("sales_deals").update({ pipeline_item_id: data.id }).eq("id", dealId);
  }

  return NextResponse.json(data, { status: 201 });
}
