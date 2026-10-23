import { NextResponse } from "next/server";
import { getActiveTemplate } from "@/lib/placementAgreements";
import { COFFEE_ACK_LABELS } from "@/lib/agreements/coffeeSupplyPackage";

/**
 * GET /api/smart-coolers/coffee-agreement
 *
 * Serves the active Free-On-Loan (Equipment Loan & Beverage Supply) contract
 * so a guest machine buyer can read and sign it in the checkout when they add
 * coffee service. Public: it's the standard marketplace contract, no PII.
 */
export async function GET() {
  const template = await getActiveTemplate("coffee_supply");
  if (!template) {
    return NextResponse.json({ error: "No active agreement template" }, { status: 503 });
  }
  return NextResponse.json({
    template: {
      id: template.id,
      version: template.version,
      title: template.title,
      content_html: template.content_html,
    },
    acknowledgments: COFFEE_ACK_LABELS,
  });
}
