import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

/** GET sales/admin users for assignment dropdowns */
export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ["admin", "sales", "director_of_sales", "market_leader"])
    .order("full_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

const VALID_ROLES = ["sales", "admin", "director_of_sales", "market_leader"];

/** POST — admin creates a new team member account */
export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { email, full_name, role, password } = body;

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (!full_name || typeof full_name !== "string" || full_name.trim().length < 2) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  }
  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `Role must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name.trim(), role },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({
      id: authUser.user.id,
      email: email.trim().toLowerCase(),
      full_name: full_name.trim(),
      role,
      country: "US",
      verified: false,
      rating: 0,
      review_count: 0,
    }, { onConflict: "id" });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({
    id: authUser.user.id,
    email: authUser.user.email,
    full_name: full_name.trim(),
    role,
  }, { status: 201 });
}
