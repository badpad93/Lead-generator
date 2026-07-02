import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { resolveTeamContextForPartner } from "@/lib/marketplaceTeam";

/**
 * DELETE — revoke a pending invite. Owner/manager only.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();
  const { id } = await params;

  const ctx = await resolveTeamContextForPartner(user.id);
  if (!ctx) return forbidden();
  if (ctx.role !== "owner" && ctx.role !== "manager") return forbidden("Owner or manager only");

  await supabaseAdmin
    .from("placement_team_invites")
    .delete()
    .eq("id", id)
    .eq("company_id", ctx.companyId)
    .is("accepted_at", null);

  return NextResponse.json({ ok: true });
}
