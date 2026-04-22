import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const { data: candidate, error: cErr } = await supabaseAdmin
    .from("candidates")
    .select("id, status")
    .eq("id", id)
    .single();

  if (cErr || !candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  if (candidate.status === "terminated") {
    return NextResponse.json({ error: "Already terminated" }, { status: 400 });
  }

  const now = new Date().toISOString();

  await supabaseAdmin.from("termination_logs").insert({
    candidate_id: id,
    terminated_by: user.id,
    reason: body.reason || null,
    terminated_at: now,
  });

  await supabaseAdmin
    .from("candidates")
    .update({ status: "terminated", terminated_at: now, updated_at: now })
    .eq("id", id);

  return NextResponse.json({ success: true });
}
