import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/* ------------------------------------------------------------------ */
/*  POST — Apex representative countersigns the agreement             */
/*  Auth required: admin or director_of_sales only                    */
/* ------------------------------------------------------------------ */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Only admin or director can countersign
  if (user.role !== "admin" && user.role !== "director_of_sales") {
    return NextResponse.json(
      { error: "Only admins or directors can sign on behalf of Apex" },
      { status: 403 },
    );
  }

  const { id } = await params;

  // Fetch agreement
  const { data: agreement, error: agErr } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("id", id)
    .single();

  if (agErr || !agreement) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  if (["cancelled", "expired"].includes(agreement.agreement_status)) {
    return NextResponse.json(
      { error: "This agreement cannot be signed" },
      { status: 400 },
    );
  }

  const body = await req.json();
  const { signer_name, signer_title, signature_data, signature_type } = body;

  if (!signer_name || typeof signer_name !== "string" || signer_name.trim() === "") {
    return NextResponse.json({ error: "signer_name is required" }, { status: 400 });
  }
  if (!signature_data || typeof signature_data !== "string" || signature_data.trim() === "") {
    return NextResponse.json({ error: "signature_data is required" }, { status: 400 });
  }

  // Insert Apex signature
  const { data: signature, error: sigErr } = await supabaseAdmin
    .from("agreement_signatures")
    .insert({
      agreement_id: agreement.id,
      signer_type: "apex",
      signer_name: signer_name.trim(),
      signer_company: agreement.apex_company_name || "Apex AI Vending LLC",
      signer_title: signer_title?.trim() || "Authorized Representative",
      signer_email: user.email,
      signature_data: signature_data.trim(),
      signature_type: signature_type || "typed",
    })
    .select("*")
    .single();

  if (sigErr) {
    return NextResponse.json({ error: sigErr.message }, { status: 500 });
  }

  // Determine new status — fully signed only if operator already signed
  const isFullySigned = !!agreement.operator_signed_at;
  const newStatus = isFullySigned ? "signed" : agreement.agreement_status;

  // Update agreement
  await supabaseAdmin
    .from("purchase_agreements")
    .update({
      agreement_status: newStatus,
      apex_signed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", agreement.id);

  // Sync status back to the sales order if linked and fully signed
  if (agreement.order_id && newStatus === "signed") {
    await supabaseAdmin
      .from("sales_orders")
      .update({ agreement_status: "signed" })
      .eq("id", agreement.order_id);
  }

  // Log activity
  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: agreement.id,
    user_id: user.id,
    activity_type: "apex_signed",
    description: `Apex countersigned by ${signer_name}${signer_title ? `, ${signer_title}` : ""}${isFullySigned ? " — Agreement fully executed" : ""}`,
  });

  return NextResponse.json({
    ok: true,
    signature,
    agreement_status: newStatus,
    fully_executed: isFullySigned,
  });
}
