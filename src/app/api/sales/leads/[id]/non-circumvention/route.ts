import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { createAndSendNonCircumvention } from "@/lib/nonCircumvention";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: leadId } = await params;

  const { data: lead } = await supabaseAdmin
    .from("sales_leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (!lead.email) {
    return NextResponse.json({ error: "Lead has no email address" }, { status: 400 });
  }

  try {
    await createAndSendNonCircumvention(leadId, {
      business_name: lead.business_name,
      contact_name: lead.contact_name,
      email: lead.email,
      phone: lead.phone,
      address: lead.address,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
