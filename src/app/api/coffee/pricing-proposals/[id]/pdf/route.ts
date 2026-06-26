import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCoffeeUser, forbiddenResponse } from "@/lib/coffeeAuth";
import { generateProposalPdf } from "@/lib/generateProposalPdf";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCoffeeUser(req);
  if (!user?.coffee_access_enabled) return forbiddenResponse();

  const { id } = await params;

  const { data: proposal, error } = await supabaseAdmin
    .from("coffee_pricing_proposals")
    .select("*, coffee_pricing_proposal_items(*)")
    .eq("id", id)
    .eq("operator_id", user.id)
    .single();

  if (error || !proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = proposal.coffee_pricing_proposal_items || [];
  const pdfBytes = await generateProposalPdf(proposal, items);

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Proposal-${proposal.proposal_number}.pdf"`,
    },
  });
}
