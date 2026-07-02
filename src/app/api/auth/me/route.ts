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

    const resolvedRole =
      meta.role && meta.role !== "admin" && meta.role !== "sales"
        ? meta.role
        : "operator";

    const newProfile: Record<string, unknown> = {
      id: user.id,
      email: user.email || "",
      full_name: fullName,
      role: resolvedRole,
      country: "US",
      verified: false,
      rating: 0,
      review_count: 0,
    };

    if (resolvedRole === "locator") {
      newProfile.locator_status = "pending_approval";
    }

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
      "payout_method", "payout_email", "payout_bank_name",
      "payout_routing_number", "payout_account_number", "payout_notes",
    ];
    // Privileged roles can ONLY be set by an admin via /api/admin/users.
    // Self-service signup must never grant admin/sales access.
    const PRIVILEGED_ROLES = new Set(["admin", "sales", "director_of_sales", "market_leader"]);
    const updates: Partial<Record<string, string | null>> = {};
    for (const field of allowedFields) {
      if (field in body) {
        if (field === "role" && PRIVILEGED_ROLES.has(body.role)) continue;
        updates[field] = body[field];
      }
    }

    if (updates.role === "locator") {
      updates.locator_status = "pending_approval";
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates as never)
      .eq("id", user.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mirror phone into auth user_metadata so the middleware phone-gate
    // sees it without a DB call on every request. Only fires when phone
    // is part of this update — cheap when unchanged.
    if ("phone" in updates && typeof updates.phone === "string" && updates.phone.trim()) {
      try {
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: { ...(user.user_metadata || {}), phone: updates.phone.trim() },
        });
      } catch { /* non-critical — DB is source of truth */ }
    }

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
