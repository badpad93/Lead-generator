import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { getUserAgreement } from "@/lib/placementAgreements";

/**
 * GET /api/coffee/agreement/pdf
 *
 * Customer-facing endpoint that returns a short-lived signed URL to
 * the caller's own fully-executed Equipment Loan & Beverage Supply
 * Agreement PDF. Emits 404 when:
 *   - the caller has no agreement of this type
 *   - the agreement isn't fully executed yet
 *   - the PDF wasn't generated (legacy rows sat around before we
 *     added PDF gen at countersign)
 *
 * The customer's own agreement only — no cross-user access. Admin
 * downloads flow through the existing admin download surface.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agreement = await getUserAgreement(userId, "coffee_supply");
  if (!agreement) return NextResponse.json({ error: "No coffee agreement on file." }, { status: 404 });
  if (agreement.status !== "fully_executed") {
    return NextResponse.json(
      {
        error: "Your Equipment Loan & Beverage Supply Agreement isn't fully executed yet.",
        status: agreement.status,
      },
      { status: 404 },
    );
  }

  // The countersign path stores the executed HTML at
  // countersigned_document_path and, for coffee, writes a .pdf
  // sibling in the same folder. Derive the PDF path from the HTML
  // path (swap extension) with a fallback to the conventional
  // per-agreement layout.
  const htmlPath = agreement.countersigned_document_path ?? agreement.executed_document_path ?? "";
  let pdfPath = "";
  if (htmlPath && htmlPath.endsWith(".html")) {
    pdfPath = `${htmlPath.slice(0, -".html".length)}.pdf`;
  } else if (htmlPath && htmlPath.endsWith(".pdf")) {
    pdfPath = htmlPath;
  } else {
    pdfPath = `coffee-supply/${agreement.user_id}/${agreement.agreement_version}/${agreement.id}.pdf`;
  }

  const { data: signed, error } = await supabaseAdmin
    .storage
    .from("user-agreements")
    .createSignedUrl(pdfPath, 300); // 5 minutes

  if (error || !signed?.signedUrl) {
    return NextResponse.json(
      {
        error:
          "Your signed PDF is not on file yet. This can happen on agreements that were countersigned before PDF-attach was rolled out — contact support and we'll re-render it for you.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    url: signed.signedUrl,
    expires_in_seconds: 300,
    filename: `Coffee-Supply-Agreement-v${agreement.agreement_version}.pdf`,
  });
}
