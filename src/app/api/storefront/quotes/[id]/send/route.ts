import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTenantByOwner } from "@/lib/storefront/tenants";
import { sendQuote } from "@/lib/storefront/quotes";
import { sendQuoteEmail } from "@/lib/storefront/emails";
import { quoteErrorResponse } from "../../route";

/**
 * Send a quote: snapshot prices + assign tier (in the domain layer), then
 * email the recipient an operator-branded quote link. Tenant scope from the
 * authenticated owner; the quote is re-verified against that tenant inside
 * sendQuote.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No storefront" }, { status: 403 });
  const { id } = await params;

  try {
    const { quote, rawToken } = await sendQuote(tenant.id, id);
    const q = quote as {
      customer_profile_id: string | null;
      prospect_email: string | null;
      prospect_first_name: string | null;
      total: number;
    };

    // Recipient: existing customer's email, else the prospect email.
    let to = q.prospect_email;
    let name: string | null = q.prospect_first_name;
    if (q.customer_profile_id) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", q.customer_profile_id)
        .maybeSingle();
      const p = prof as { email: string | null; full_name: string | null } | null;
      to = p?.email ?? to;
      name = p?.full_name ?? name;
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const quoteUrl = `${origin}/coffee/quote/${rawToken}`;
    if (to) {
      void sendQuoteEmail({ tenant, to, recipientName: name, total: Number(q.total), quoteUrl });
    }
    // Return the link so the operator can also copy it (no email on file, etc.).
    return NextResponse.json({ quote, quote_url: quoteUrl, emailed: !!to });
  } catch (err) {
    return quoteErrorResponse(err);
  }
}
