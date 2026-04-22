import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("onboarding_pipelines")
    .select("*, onboarding_steps(id, name, step_key, order_index)")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sorted = (data || []).map((p) => ({
    ...p,
    onboarding_steps: (p.onboarding_steps || []).sort(
      (a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index
    ),
  }));

  return NextResponse.json(sorted);
}
