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
    // Auto-create profile from auth user data (e.g. Google OAuth users)
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
      // Never allow self-signup to grant admin/sales — those roles are admin-assigned only
      role:
        meta.role && meta.role !== "admin" && meta.role !== "sales"
          ? meta.role
          : "requestor",
      country: "US",
      verified: false,
      rating: 0,
      review_count: 0,
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
      "address", "city", "state", "zip", "role",
      "digest_opt_in", "digest_frequency",
    ];
    // Privileged roles can ONLY be set by an admin via /api/admin/users.
    // Self-service signup must never grant admin/sales access.
    const PRIVILEGED_ROLES = new Set(["admin", "sales", "director_of_sales", "market_leader"]);
    if (
      "role" in body &&
      typeof body.role === "string" &&
      PRIVILEGED_ROLES.has(body.role)
    ) {
      return NextResponse.json(
        { error: "This role can only be assigned by an admin" },
        { status: 403 }
      );
    }
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

    if (
      data.role === "operator" &&
      data.address &&
      data.city &&
      data.state &&
      data.zip
    ) {
      const { count } = await supabaseAdmin
        .from("operator_listings")
        .select("id", { count: "exact", head: true })
        .eq("operator_id", user.id);

      if (count === 0) {
        const title = data.company_name
          ? `${data.company_name} — Vending Operator`
          : `${data.full_name} — Vending Operator`;

        await supabaseAdmin.from("operator_listings").insert({
          operator_id: user.id,
          title,
          description: null,
          machine_types: ["snack", "beverage", "combo"],
          service_radius_miles: 50,
          cities_served: [data.city],
          states_served: [data.state],
          accepts_commission: true,
          min_daily_traffic: 0,
          machine_count_available: 1,
          status: "available",
          featured: false,
        });
      }
    }

    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
