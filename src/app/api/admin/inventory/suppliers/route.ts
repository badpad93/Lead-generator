import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

// Empty strings from the modal's text inputs should be treated as
// null on optional fields — otherwise "" fails max/type validation.
const nullableStr = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().max(max).nullable().optional(),
  );
const nullableInt = (min: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(min).nullable().optional(),
  );

const createSchema = z.object({
  name: z.string().min(1).max(200),
  contact_name: nullableStr(200),
  // contact_email is descriptive not authentication — accept any free
  // text up to 200 chars rather than reject when an admin types e.g.
  // "sales at company dot com" or a name here.
  contact_email: nullableStr(200),
  contact_phone: nullableStr(50),
  address: nullableStr(1000),
  lead_time_days: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 7 : Number(v)),
    z.number().int().min(0).default(7),
  ),
  minimum_order_qty: nullableInt(0),
  payment_terms: nullableStr(200),
  notes: nullableStr(2000),
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
    const first = parsed.error.issues[0];
    const path = first?.path?.join(".") || "unknown_field";
    return NextResponse.json(
      { error: `Invalid input on ${path}: ${first?.message ?? "validation failed"}`, details: parsed.error.format() },
      { status: 400 },
    );
  }
  const { data, error } = await supabaseAdmin
    .from("suppliers")
    .insert({ ...parsed.data, created_by: adminId })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ supplier: data }, { status: 201 });
}
