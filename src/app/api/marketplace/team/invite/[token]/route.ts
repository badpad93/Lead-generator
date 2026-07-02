import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

/**
 * GET — public preview of the invite (no auth needed) so the accept page
 * can render "You've been invited to <Company>" before the user signs in.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: invite } = await supabaseAdmin
    .from("placement_team_invites")
    .select("id, email, role, expires_at, accepted_at, company:company_id(business_name)")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.accepted_at) return NextResponse.json({ error: "Already accepted" }, { status: 400 });
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 400 });
  }

  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    company_name: (Array.isArray(invite.company) ? invite.company[0]?.business_name : (invite.company as { business_name?: string } | null)?.business_name) || "a placement partner",
  });
}

/**
 * POST — accept the invite. Requires the invited email to match the logged-in
 * profile's email. Upgrades their role to placement_partner and creates the
 * team_member row.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Sign in to accept" }, { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { data: invite } = await supabaseAdmin
    .from("placement_team_invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.accepted_at) return NextResponse.json({ error: "Already accepted" }, { status: 400 });
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 400 });
  }

  if (profile.email.trim().toLowerCase() !== invite.email.trim().toLowerCase()) {
    return NextResponse.json(
      { error: `This invite is for ${invite.email}. Sign in with that account.` },
      { status: 400 },
    );
  }

  // Upgrade role
  if (profile.role !== "placement_partner") {
    await supabaseAdmin.from("profiles").update({ role: "placement_partner" }).eq("id", userId);
  }

  // Create team membership
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("placement_team_members")
    .upsert(
      {
        company_id: invite.company_id,
        profile_id: userId,
        role: invite.role,
        active: true,
        invited_by: invite.invited_by,
        invited_at: invite.created_at,
        joined_at: now,
      },
      { onConflict: "company_id,profile_id" },
    );

  // Mark invite accepted
  await supabaseAdmin
    .from("placement_team_invites")
    .update({ accepted_at: now })
    .eq("id", invite.id);

  return NextResponse.json({ ok: true, company_id: invite.company_id });
}
