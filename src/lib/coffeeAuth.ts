import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "./apiAuth";
import { supabaseAdmin } from "./supabaseAdmin";

export async function getCoffeeUser(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role, coffee_access_enabled, coffee_agreement_signed, coffee_application_status")
    .eq("id", userId)
    .single();

  return profile ?? null;
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "Coffee services access required" }, { status: 403 });
}
