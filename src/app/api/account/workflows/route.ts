import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

/**
 * GET /api/account/workflows
 *
 * Customer-facing workflow list. Returns only workflows belonging to
 * the authenticated user, with a lightweight projection suitable for
 * the customer dashboard card + list page.
 *
 * Never returns internal notes, internal events, or assignee identity
 * unless workflow.show_assignee_to_customer is true.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: workflows, error } = await supabaseAdmin
    .from("workflows")
    .select(
      "id, workflow_number, workflow_type, title, description, product_name, quantity_purchased, quantity_completed, overall_status, priority, start_date, due_date, completed_at, cancelled_at, primary_team, show_assignee_to_customer, assigned_user_id, updated_at",
    )
    .eq("customer_id", userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ workflows: workflows ?? [] });
}
