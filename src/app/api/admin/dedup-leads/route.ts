import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Find all business_names with more than one lead
  const { data: allLeads, error } = await supabaseAdmin
    .from("sales_leads")
    .select("id, business_name, created_at, status, assigned_to, account_id, email, phone")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groups = new Map<string, typeof allLeads>();
  for (const lead of allLeads || []) {
    const key = (lead.business_name || "").trim().toLowerCase();
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push(lead);
    groups.set(key, group);
  }

  let deleted = 0;
  let reassigned = 0;
  const details: string[] = [];

  for (const [name, group] of groups) {
    if (group.length <= 1) continue;

    // Keep the lead with the most data, preferring qualified status and earliest creation
    const keep = group.sort((a, b) => {
      if (a.status === "qualified" && b.status !== "qualified") return -1;
      if (b.status === "qualified" && a.status !== "qualified") return 1;
      if (a.account_id && !b.account_id) return -1;
      if (b.account_id && !a.account_id) return 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    })[0];

    const dupes = group.filter((l) => l.id !== keep.id);

    for (const dupe of dupes) {
      // Reassign FKs from dupe to the kept lead
      await supabaseAdmin.from("sales_deals").update({ lead_id: keep.id }).eq("lead_id", dupe.id);
      await supabaseAdmin.from("pipeline_items").update({ lead_id: keep.id }).eq("lead_id", dupe.id);
      await supabaseAdmin.from("location_agreements").update({ lead_id: keep.id }).eq("lead_id", dupe.id);
      await supabaseAdmin.from("non_circumvention_agreements").update({ lead_id: keep.id }).eq("lead_id", dupe.id);
      await supabaseAdmin.from("locations").update({ sales_lead_id: keep.id }).eq("sales_lead_id", dupe.id);

      // Delete the duplicate (lead_emails and activity_log cascade automatically)
      const { error: delErr } = await supabaseAdmin.from("sales_leads").delete().eq("id", dupe.id);
      if (!delErr) {
        deleted++;
      } else {
        details.push(`Failed to delete ${dupe.id} (${name}): ${delErr.message}`);
      }
    }

    reassigned++;
    details.push(`"${name}": kept ${keep.id}, removed ${dupes.length} duplicate(s)`);
  }

  return NextResponse.json({ deleted, groups_deduped: reassigned, details });
}
