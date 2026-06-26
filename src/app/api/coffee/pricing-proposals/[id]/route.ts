import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCoffeeUser, forbiddenResponse } from "@/lib/coffeeAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCoffeeUser(req);
  if (!user?.coffee_access_enabled) return forbiddenResponse();

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("coffee_pricing_proposals")
    .select("*, coffee_pricing_proposal_items(*)")
    .eq("id", id)
    .eq("operator_id", user.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCoffeeUser(req);
  if (!user?.coffee_access_enabled) return forbiddenResponse();

  const { id } = await params;
  const body = await req.json();

  const { data: existing } = await supabaseAdmin
    .from("coffee_pricing_proposals")
    .select("id")
    .eq("id", id)
    .eq("operator_id", user.id)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowedFields = [
    "client_name", "client_company", "client_email", "client_phone",
    "company_name", "company_email", "company_phone", "company_website",
    "company_address", "company_city", "company_state", "company_zip",
    "notes", "valid_until", "status",
  ];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key];
  }

  const { error: updateError } = await supabaseAdmin
    .from("coffee_pricing_proposals")
    .update(updates)
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (body.items && Array.isArray(body.items)) {
    await supabaseAdmin
      .from("coffee_pricing_proposal_items")
      .delete()
      .eq("proposal_id", id);

    if (body.items.length > 0) {
      const items = body.items.map((item: Record<string, unknown>, idx: number) => ({
        proposal_id: id,
        product_id: item.product_id || null,
        product_name: item.product_name || "",
        sku: item.sku || null,
        category: item.category || null,
        unit: item.unit || "each",
        unit_cost: Number(item.unit_cost) || 0,
        pack_quantity: Number(item.pack_quantity) || 1,
        retail_price: Number(item.retail_price) || 0,
        quantity: Number(item.quantity) || 1,
        cost_subtotal: Number(item.cost_subtotal) || 0,
        retail_subtotal: Number(item.retail_subtotal) || 0,
        profit: Number(item.profit) || 0,
        margin_pct: Number(item.margin_pct) || 0,
        sort_order: idx,
      }));

      await supabaseAdmin.from("coffee_pricing_proposal_items").insert(items);

      const totalCost = items.reduce((s: number, i: { cost_subtotal: number }) => s + i.cost_subtotal, 0);
      const totalRetail = items.reduce((s: number, i: { retail_subtotal: number }) => s + i.retail_subtotal, 0);
      const totalProfit = totalRetail - totalCost;
      const overallMargin = totalRetail > 0 ? (totalProfit / totalRetail) * 100 : 0;

      await supabaseAdmin
        .from("coffee_pricing_proposals")
        .update({ total_cost: totalCost, total_retail: totalRetail, total_profit: totalProfit, overall_margin: overallMargin })
        .eq("id", id);
    }
  }

  await supabaseAdmin.from("coffee_pricing_proposal_activity_log").insert({
    proposal_id: id,
    action: "updated",
    actor_id: user.id,
    actor_name: user.full_name,
  });

  const { data: updated } = await supabaseAdmin
    .from("coffee_pricing_proposals")
    .select("*, coffee_pricing_proposal_items(*)")
    .eq("id", id)
    .single();

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCoffeeUser(req);
  if (!user?.coffee_access_enabled) return forbiddenResponse();

  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from("coffee_pricing_proposals")
    .select("id, status")
    .eq("id", id)
    .eq("operator_id", user.id)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "draft") {
    return NextResponse.json({ error: "Only draft proposals can be deleted" }, { status: 400 });
  }

  await supabaseAdmin.from("coffee_pricing_proposals").delete().eq("id", id);
  return NextResponse.json({ success: true });
}
