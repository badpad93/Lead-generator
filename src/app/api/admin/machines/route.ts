import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildMachinePayload,
  type MachineInput,
} from "@/lib/adminMachinePayload";

/**
 * GET /api/admin/machines — list ALL machines including inactive.
 *
 * The public /api/machines endpoint only returns active machines;
 * admins need to see and edit disapproved/hidden ones too.
 */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("machines")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ machines: data || [] });
}

/** POST /api/admin/machines — create a new machine catalog entry */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: MachineInput;
  try {
    body = (await req.json()) as MachineInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { payload, error: validationError } = buildMachinePayload(body, {
    isCreate: true,
  });
  if (validationError || !payload) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("machines")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A machine with that slug already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ machine: data }, { status: 201 });
}
