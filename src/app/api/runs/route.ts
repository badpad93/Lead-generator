import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createRunSchema } from "@/lib/schemas";

/** POST /api/runs – create a new run */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createRunSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { city, state, radius, maxLeads, industries } = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("runs")
      .insert({
        city,
        state: state.toUpperCase(),
        radius_miles: radius,
        max_leads: maxLeads,
        industries,
        status: "queued",
        progress: { total: 0, message: "Queued – waiting to start" },
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET /api/runs – list recent runs */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
