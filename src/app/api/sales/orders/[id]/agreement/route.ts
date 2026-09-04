import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { createAgreementFromOrder, AgreementCreationError } from "@/lib/salesAgreements";

/* ------------------------------------------------------------------ */
/*  POST — Create a purchase agreement from an order                  */
/*                                                                    */
/*  Thin back-compat delegate. Agreement creation lives on ONE set    */
/*  of rails (createAgreementFromOrder, also reachable via            */
/*  POST /api/sales/agreements with { order_id }). This route stays   */
/*  only so existing callers keep working — it holds no logic of its  */
/*  own, so the order flow and the agreements page can never diverge. */
/* ------------------------------------------------------------------ */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: orderId } = await params;
  try {
    const agreement = await createAgreementFromOrder({ orderId, userId: user.id });
    return NextResponse.json(agreement, { status: 201 });
  } catch (err) {
    if (err instanceof AgreementCreationError) {
      return NextResponse.json(
        { error: err.message, ...(err.code ? { code: err.code } : {}) },
        { status: err.status },
      );
    }
    console.error("[orders/agreement] create failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  GET — List agreements for an order                                */
/* ------------------------------------------------------------------ */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: orderId } = await params;

  const { data: agreements, error } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich each agreement with initials/signature counts
  const enriched = await Promise.all(
    (agreements || []).map(async (ag) => {
      const [{ count: initialsCount }, { count: signaturesCount }] =
        await Promise.all([
          supabaseAdmin
            .from("agreement_initials")
            .select("*", { count: "exact", head: true })
            .eq("agreement_id", ag.id),
          supabaseAdmin
            .from("agreement_signatures")
            .select("*", { count: "exact", head: true })
            .eq("agreement_id", ag.id),
        ]);

      return {
        ...ag,
        initials_count: initialsCount ?? 0,
        signatures_count: signaturesCount ?? 0,
      };
    }),
  );

  return NextResponse.json(enriched);
}
