import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: proposal, error } = await supabaseAdmin
    .from("coffee_pricing_proposals")
    .select("id, proposal_number, status, client_name, client_company, client_email, client_phone, company_name, company_email, company_phone, company_website, company_address, company_city, company_state, company_zip, total_retail, notes, valid_until, created_at, coffee_pricing_proposal_items(id, product_name, category, unit, pack_quantity, retail_price, quantity, retail_subtotal, sort_order)")
    .eq("share_token", token)
    .single();

  if (error || !proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  if (proposal.valid_until && new Date(proposal.valid_until) < new Date()) {
    await supabaseAdmin
      .from("coffee_pricing_proposals")
      .update({ status: "expired" })
      .eq("id", proposal.id);
  }

  if (proposal.status === "sent") {
    await supabaseAdmin
      .from("coffee_pricing_proposals")
      .update({ status: "viewed", updated_at: new Date().toISOString() })
      .eq("id", proposal.id);

    await supabaseAdmin.from("coffee_pricing_proposal_activity_log").insert({
      proposal_id: proposal.id,
      action: "viewed",
      details: { viewed_at: new Date().toISOString() },
    });
  }

  return NextResponse.json(proposal);
}
