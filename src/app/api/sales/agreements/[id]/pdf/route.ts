import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { generatePurchaseAgreementPdf } from "@/lib/generateAgreementPdf";

/* ------------------------------------------------------------------ */
/*  GET — Generate and return the purchase agreement as PDF           */
/* ------------------------------------------------------------------ */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: ag, error } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !ag)
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });

  // Fetch signatures and initials
  const [{ data: signatures }, { data: initials }] = await Promise.all([
    supabaseAdmin
      .from("agreement_signatures")
      .select("*")
      .eq("agreement_id", id)
      .order("signed_at", { ascending: false }),
    supabaseAdmin
      .from("agreement_initials")
      .select("*")
      .eq("agreement_id", id)
      .order("initialed_at", { ascending: true }),
  ]);

  try {
    const pdfBytes = await generatePurchaseAgreementPdf(ag, signatures || [], initials || []);
    const fileName = `Purchase-Agreement-${(ag.operator_company_name || "draft").replace(/[^a-zA-Z0-9]/g, "_")}-${id.slice(0, 8)}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `PDF generation failed: ${msg}` }, { status: 500 });
  }
}
