import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { isValidHttpUrl } from "@/lib/teamCredentials/emails";

/**
 * GET  /api/admin/team/credential-presets  — admin-only
 * POST /api/admin/team/credential-presets  — admin-only
 *   Body: { name: string, default_login_url?: string }
 *
 * Presets carry ONLY a system name + optional login URL — never
 * credentials. Admins pick a preset to prefill the system-name and
 * URL fields on a new credential row; usernames and passwords are
 * always entered fresh.
 */
export async function GET(req: NextRequest) {
  const actor = await getSalesUser(req);
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const adminId = actor.id;

  const { data, error } = await supabaseAdmin
    .from("team_credential_presets")
    .select("id, name, default_login_url")
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ presets: data ?? [] });
}

export async function POST(req: NextRequest) {
  const actor = await getSalesUser(req);
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const adminId = actor.id;

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const url  = typeof body?.default_login_url === "string" ? body.default_login_url.trim() : "";

  if (!name) return NextResponse.json({ error: "Preset name is required." }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "Preset name too long." }, { status: 400 });
  if (url && !isValidHttpUrl(url)) {
    return NextResponse.json(
      { error: "Login URL must start with http:// or https://." },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("team_credential_presets")
    .insert({
      name,
      default_login_url: url || null,
      created_by: adminId,
    })
    .select("id, name, default_login_url")
    .single();

  if (error) {
    if (/duplicate key value/i.test(error.message)) {
      return NextResponse.json(
        { error: "A preset with that name already exists." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ preset: data });
}
