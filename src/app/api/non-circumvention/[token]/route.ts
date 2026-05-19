import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const { data, error } = await supabaseAdmin
    .from("non_circumvention_agreements")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  if (data.status === "pending") {
    await supabaseAdmin
      .from("non_circumvention_agreements")
      .update({ status: "viewed", updated_at: new Date().toISOString() })
      .eq("id", data.id);
    data.status = "viewed";
  }

  return NextResponse.json(data);
}
