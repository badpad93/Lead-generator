import { NextRequest, NextResponse } from "next/server";
import { getSalesUser } from "@/lib/salesAuth";
import { checkStepGating } from "@/lib/stepGating";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: itemId } = await params;

  const url = new URL(req.url);
  const stepId = url.searchParams.get("step_id");

  if (!stepId) {
    return NextResponse.json(
      { error: "step_id query parameter required" },
      { status: 400 }
    );
  }

  const gating = await checkStepGating(itemId, stepId);
  return NextResponse.json(gating);
}
