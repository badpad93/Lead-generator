import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("email_templates_v2")
    .select("*")
    .order("pipeline_type")
    .order("step_key");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { pipeline_type, step_key, subject, body_html } = body;
  if (!pipeline_type || !step_key || !subject || !body_html) {
    return NextResponse.json({ error: "All fields required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("email_templates_v2")
    .insert({ pipeline_type, step_key, subject, body_html })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
