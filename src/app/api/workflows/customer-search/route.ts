import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getWorkflowActor, isStaff } from "@/lib/workflows/permissions";

/**
 * GET /api/workflows/customer-search?q=<query>
 *
 * Search-as-you-type customer picker for the manual "New Workflow"
 * flow. Returns up to 20 profiles matching by full_name or email,
 * ordered by full_name. Staff-only.
 *
 * Excludes sales-team roles from the results — those are staff, not
 * customers.
 */
export async function GET(req: NextRequest) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaff(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role")
    .or(`full_name.ilike.${like},email.ilike.${like}`)
    .not("role", "in", "(admin,director_of_sales,market_leader,sales_manager,sales)")
    .order("full_name")
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data ?? [] });
}
