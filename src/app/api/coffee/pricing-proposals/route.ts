import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCoffeeUser, forbiddenResponse } from "@/lib/coffeeAuth";

export async function GET(req: NextRequest) {
  const user = await getCoffeeUser(req);
  if (!user?.coffee_access_enabled) return forbiddenResponse();

  const { data, error } = await supabaseAdmin
    .from("coffee_pricing_proposals")
    .select("*, coffee_pricing_proposal_items(count)")
    .eq("operator_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getCoffeeUser(req);
  if (!user?.coffee_access_enabled) return forbiddenResponse();

  try {
    const body = await req.json();

    const profile = await supabaseAdmin
      .from("profiles")
      .select("company_name, email, phone, website, address, city, state, zip")
      .eq("id", user.id)
      .single();

    const p = profile.data;

    // Generate a unique proposal number with retry for duplicates
    let data = null;
    let insertError = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { count } = await supabaseAdmin
        .from("coffee_pricing_proposals")
        .select("*", { count: "exact", head: true });

      const seq = (count || 0) + 1 + attempt;
      const proposalNumber = `PRC-${String(seq).padStart(5, "0")}`;

      const result = await supabaseAdmin
        .from("coffee_pricing_proposals")
        .insert({
          operator_id: user.id,
          proposal_number: proposalNumber,
          client_name: body.client_name || null,
          client_company: body.client_company || null,
          client_email: body.client_email || null,
          client_phone: body.client_phone || null,
          company_name: body.company_name || p?.company_name || null,
          company_email: body.company_email || p?.email || user.email,
          company_phone: body.company_phone || p?.phone || null,
          company_website: body.company_website || p?.website || null,
          company_address: body.company_address || p?.address || null,
          company_city: body.company_city || p?.city || null,
          company_state: body.company_state || p?.state || null,
          company_zip: body.company_zip || p?.zip || null,
          notes: body.notes || null,
          valid_until: body.valid_until || null,
        })
        .select()
        .single();

      if (!result.error) {
        data = result.data;
        insertError = null;
        break;
      }

      if (result.error.code === "23505") {
        insertError = result.error;
        continue;
      }

      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: insertError?.message || "Failed to create proposal" }, { status: 500 });
    }

    if (body.items && Array.isArray(body.items) && body.items.length > 0) {
      const items = body.items.map((item: Record<string, unknown>, idx: number) => ({
        proposal_id: data.id,
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
        .update({
          total_cost: totalCost,
          total_retail: totalRetail,
          total_profit: totalProfit,
          overall_margin: overallMargin,
        })
        .eq("id", data.id);
    }

    await supabaseAdmin.from("coffee_pricing_proposal_activity_log").insert({
      proposal_id: data.id,
      action: "created",
      actor_id: user.id,
      actor_name: user.full_name,
    });

    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
