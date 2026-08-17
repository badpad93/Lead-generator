import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/webhooks/dwolla
 *
 * Dwolla webhook receiver. Signs each request with an HMAC-SHA256 of
 * the raw body using DWOLLA_WEBHOOK_SECRET as the key; header is
 * X-Request-Signature-SHA-256.
 *
 * We care about transfer lifecycle events for marketplace_payouts:
 *   customer_transfer_completed  → status='paid', paid_at stamped
 *   customer_transfer_failed     → status='failed', dwolla_error stashed
 *   customer_transfer_cancelled  → status='cancelled'
 *   customer_bank_transfer_creation_failed → status='failed'
 *
 * We ALSO listen for funding-source verification events so the
 * partner row's dwolla_verification_status stays honest if Dwolla
 * later suspends/deactivates a source:
 *   customer_funding_source_verified   → verified
 *   customer_funding_source_removed    → deactivated
 *   customer_funding_source_unverified → unverified
 *
 * Any other topic is acknowledged with 200 so Dwolla doesn't retry.
 */

interface DwollaWebhookEnvelope {
  id: string;
  resourceId: string;
  topic: string;
  timestamp: string;
  _links?: {
    resource?: { href?: string };
    customer?: { href?: string };
  };
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.DWOLLA_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[dwolla-webhook] DWOLLA_WEBHOOK_SECRET not configured");
    return false;
  }
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-request-signature-sha-256");
  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: DwollaWebhookEnvelope;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const topic = event.topic;
  const resourceId = event.resourceId;
  const nowIso = new Date().toISOString();

  // Transfer lifecycle → update marketplace_payouts by dwolla_transfer_id
  if (
    topic === "customer_transfer_completed" ||
    topic === "customer_transfer_failed" ||
    topic === "customer_transfer_cancelled" ||
    topic === "customer_bank_transfer_creation_failed"
  ) {
    const patch: Record<string, unknown> = {
      dwolla_transfer_status: topic,
      updated_at: nowIso,
    };
    if (topic === "customer_transfer_completed") {
      patch.status = "paid";
      patch.paid_at = nowIso;
      patch.dwolla_error = null;
    } else if (topic === "customer_transfer_cancelled") {
      patch.status = "cancelled";
    } else {
      patch.status = "failed";
      patch.dwolla_error = topic;
    }

    const { data: updated } = await supabaseAdmin
      .from("marketplace_payouts")
      .update(patch)
      .eq("dwolla_transfer_id", resourceId)
      .select("id, status")
      .maybeSingle();

    if (updated && updated.status === "paid") {
      try {
        const { notifyPartnerPayoutSent } = await import("@/lib/marketplaceNotifications");
        notifyPartnerPayoutSent(updated.id).catch(() => undefined);
      } catch (notifyErr) {
        console.error("[dwolla-webhook] notify failed:", notifyErr);
      }
    }

    return NextResponse.json({ ok: true, handled: topic });
  }

  // Funding source lifecycle → update placement_partners by dwolla_funding_source_id
  // Dwolla sends the full resource URL in _links.resource.href
  if (
    topic === "customer_funding_source_verified" ||
    topic === "customer_funding_source_removed" ||
    topic === "customer_funding_source_unverified"
  ) {
    const resourceUrl = event._links?.resource?.href;
    if (resourceUrl) {
      const nextStatus =
        topic === "customer_funding_source_verified"
          ? "verified"
          : topic === "customer_funding_source_removed"
          ? "deactivated"
          : "unverified";
      const patch: Record<string, unknown> = {
        dwolla_verification_status: nextStatus,
      };
      if (nextStatus === "verified") patch.dwolla_verified_at = nowIso;
      await supabaseAdmin
        .from("placement_partners")
        .update(patch)
        .eq("dwolla_funding_source_id", resourceUrl);
    }
    return NextResponse.json({ ok: true, handled: topic });
  }

  // Unknown topic — acknowledge so Dwolla stops retrying
  return NextResponse.json({ ok: true, ignored: topic });
}
