import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const [
    { data: submission },
    { data: photos },
    { data: activity },
  ] = await Promise.all([
    supabaseAdmin
      .from("placement_submissions")
      .select("*, contract:contract_id(*), partner:partner_id(business_name, id)")
      .eq("id", id)
      .maybeSingle(),
    supabaseAdmin.from("placement_submission_photos").select("*").eq("submission_id", id).order("sort_order"),
    supabaseAdmin.from("placement_submission_activity").select("*").eq("submission_id", id).order("created_at", { ascending: false }),
  ]);

  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ submission, photos: photos || [], activity: activity || [] });
}
