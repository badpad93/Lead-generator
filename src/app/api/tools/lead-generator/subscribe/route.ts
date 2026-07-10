import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { getLeadGeneratorAccess } from "@/lib/leadGeneratorAccess";
import { subscribe } from "@/lib/leadGeneratorSubscription";

/**
 * POST /api/tools/lead-generator/subscribe
 *
 * Starts a $9.99/month Lead Generator subscription for the caller.
 * Creates a QB invoice + returns the invoice pay link. The subscription
 * status flips to active only when the QB webhook posts a Payment
 * against the invoice — no client-side "success" grants access.
 *
 * Guard: only paid roles can subscribe (operator / location_manager /
 * requestor). Free-role users trying to subscribe get a friendly 409.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getLeadGeneratorAccess(userId);
  if (!access.requiresSubscription) {
    if (access.canAccessLeadGenerator) {
      return NextResponse.json(
        { error: "Your account already has free Lead Generator access — no subscription needed" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Lead Generator subscription isn't available for this account. Contact support." },
      { status: 403 },
    );
  }

  const result = await subscribe(userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    subscription_id: result.subscription_id,
    invoice_id: result.invoice_id,
    invoice_link: result.invoice_link,
  });
}
