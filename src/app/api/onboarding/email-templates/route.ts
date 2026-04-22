import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("email_templates_v2")
    .select("*")
    .order("pipeline_type")
    .order("step_key");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
