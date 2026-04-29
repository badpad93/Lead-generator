import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { filterByRole } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let query = supabaseAdmin
    .from("sales_deals")
    .select("*, deal_services(*), pipelines(id, name)")
    .order("created_at", { ascending: false });

  try {
    query = await filterByRole(query, user, { creatorCol: "assigned_to" }) as typeof query;
  } catch {
    if (user.role !== "admin" && user.role !== "director_of_sales") {
      return NextResponse.json([]);
    }
  }

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const deals = data || [];
  const ids = Array.from(new Set(deals.map((d) => d.assigned_to).filter(Boolean))) as string[];
  let nameById: Record<string, { full_name: string | null; email: string | null }> = {};
  if (ids.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    nameById = Object.fromEntries(
      (profiles || []).map((p) => [p.id, { full_name: p.full_name, email: p.email }])
    );
  }
  const hydrated = deals.map((d) => ({
    ...d,
    assigned_profile: d.assigned_to ? nameById[d.assigned_to] || null : null,
  }));
  return NextResponse.json(hydrated);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { lead_id, business_name, stage, pipeline_id, account_id } = body;
  if (!business_name) return NextResponse.json({ error: "business_name required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("sales_deals")
    .insert({
      lead_id: lead_id || null,
      account_id: account_id || null,
      assigned_to: user.id,
      stage: stage || "new",
      value: 0,
      business_name,
      pipeline_id: pipeline_id || null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-create pipeline item if a pipeline was selected
  if (pipeline_id && data) {
    const { data: firstStep } = await supabaseAdmin
      .from("pipeline_steps")
      .select("id")
      .eq("pipeline_id", pipeline_id)
      .order("order_index")
      .limit(1)
      .maybeSingle();

    const { data: pipelineItem } = await supabaseAdmin
      .from("pipeline_items")
      .insert({
        pipeline_id,
        name: business_name,
        status: "active",
        current_step_id: firstStep?.id || null,
        value: 0,
        assigned_to: user.id,
        account_id: account_id || null,
        lead_id: lead_id || null,
        deal_id: data.id,
      })
      .select("id")
      .single();

    if (pipelineItem) {
      await supabaseAdmin.from("sales_deals").update({ pipeline_item_id: pipelineItem.id }).eq("id", data.id);
    }
  }

  return NextResponse.json(data, { status: 201 });
}
