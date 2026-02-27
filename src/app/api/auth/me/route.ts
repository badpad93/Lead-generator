import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

/** GET /api/auth/me — get current user's profile */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    // Auto-create profile from auth user data (e.g. Discord OAuth users)
    const meta = user.user_metadata || {};
    const fullName =
      meta.full_name ||
      meta.name ||
      meta.custom_claims?.global_name ||
      user.email?.split("@")[0] ||
      "User";

    const newProfile = {
      id: user.id,
      email: user.email || "",
      full_name: fullName,
      role: meta.role || "requestor",
      avatar_url: meta.avatar_url || meta.picture || null,
    };

    const { data: created, error: insertError } = await supabaseAdmin
      .from("profiles")
      .upsert(newProfile, { onConflict: "id" })
      .select("*")
      .single();

    if (insertError || !created) {
      return NextResponse.json({ error: "Could not create profile" }, { status: 500 });
    }

    return NextResponse.json(created);
  }

  return NextResponse.json(profile);
}

/** PATCH /api/auth/me — update current user's profile */
export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const allowedFields = [
      "full_name", "company_name", "phone", "website", "bio",
      "city", "state", "zip", "avatar_url", "role",
    ];
    const updates: Partial<Record<string, string | null>> = {};
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates as never)
      .eq("id", user.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
