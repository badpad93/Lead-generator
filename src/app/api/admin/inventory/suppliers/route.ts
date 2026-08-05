import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  contact_name: z.string().max(200).nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  contact_phone: z.string().max(50).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  lead_time_days: z.number().int().min(0).default(7),
  minimum_order_qty: z.number().int().min(0).nullable().optional(),
  payment_terms: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const active = new URL(req.url).searchParams.get("active");
  let query = supabaseAdmin
    .from("suppliers")
    .select("*")
    .order("name", { ascending: true });
  if (active === "true") query = query.eq("active", true);
  if (active === "false") query = query.eq("active", false);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ suppliers: data ?? [] });
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("suppliers")
    .insert({ ...parsed.data, created_by: adminId })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ supplier: data }, { status: 201 });
}
