import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("pipeline_items")
    .select("*, pipelines(id, name, type), pipeline_steps!pipeline_items_current_step_id_fkey(id, name, order_index), sales_accounts(id, business_name, contact_name, phone, email, address, entity_type), employees(full_name, email), pipeline_item_documents(*, step_documents(*)), locations(*)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  // Also fetch all steps for this pipeline with their required documents
  const { data: allSteps } = await supabaseAdmin
    .from("pipeline_steps")
    .select("*, step_documents(*)")
    .eq("pipeline_id", data.pipeline_id)
    .order("order_index");

  // Fetch location agreement status if a location with a lead exists
  let location_agreement = null;
  if (data.locations?.sales_lead_id) {
    const { data: la } = await supabaseAdmin
      .from("location_agreements")
      .select("id, status, signature_name, signed_at, business_name, contact_name, email, phone, created_at")
      .eq("lead_id", data.locations.sales_lead_id)
      .maybeSingle();
    location_agreement = la;
  }

  return NextResponse.json({ ...data, all_steps: allSteps || [], location_agreement });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const allowed = ["name", "status", "value", "notes", "account_id", "employee_id", "assigned_to", "location_id"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabaseAdmin
    .from("pipeline_items")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
