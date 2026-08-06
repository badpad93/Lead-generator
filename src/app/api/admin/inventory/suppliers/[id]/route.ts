import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

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

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  contact_name: nullableStr(200),
  contact_email: nullableStr(200), // free-text, no email format check
  contact_phone: nullableStr(50),
  address: nullableStr(1000),
  lead_time_days: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().int().min(0).optional(),
  ),
  minimum_order_qty: nullableInt(0),
  payment_terms: nullableStr(200),
  notes: nullableStr(2000),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
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
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ supplier: data });
}
