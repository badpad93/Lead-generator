import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** POST /api/runs/[id]/start – set status to running if queued */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // First check current status
  const { data: run, error: fetchErr } = await supabaseAdmin
    .from("runs")
    .select("status")
    .eq("id", id)
    .single();

  if (fetchErr || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "queued") {
    return NextResponse.json(
      { error: `Run is already ${run.status}` },
      { status: 400 }
    );
  }

  const { error: updateErr } = await supabaseAdmin
    .from("runs")
    .update({
      status: "running",
      progress: { total: 0, message: "Starting…" },
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
