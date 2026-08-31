import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { sendLocatorApprovedEmail, sendLocatorRejectedEmail } from "@/lib/welcomeEmail";

/** PATCH /api/admin/users/[id] — admin updates a user profile */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const allowedFields = [
      "full_name", "email", "role", "company_name", "phone",
      "website", "bio", "address", "city", "state", "zip", "country",
      "verified", "featured", "coffee_access_enabled", "locator_status",
      "coffee_pricing_tier_id",
    ];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Track the previous coffee_pricing_tier_id for audit-log write.
    let previousTierId: string | null = null;
    if ("coffee_pricing_tier_id" in updates) {
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("coffee_pricing_tier_id")
        .eq("id", id)
        .maybeSingle();
      previousTierId = (existing?.coffee_pricing_tier_id as string | null) || null;

      // Validate the new tier id if non-null.
      if (updates.coffee_pricing_tier_id) {
        const { data: tier } = await supabaseAdmin
          .from("coffee_pricing_tiers")
          .select("id, tier_key, name")
          .eq("id", updates.coffee_pricing_tier_id as string)
          .maybeSingle();
        if (!tier) {
          return NextResponse.json({ error: "Unknown coffee pricing tier" }, { status: 400 });
        }
      }
    }

    // When admin removes featured status, cancel the Stripe subscription and clear the ID
    if (updates.featured === false) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("stripe_subscription_id")
        .eq("id", id)
        .single();

      if (profile?.stripe_subscription_id) {
        const stripeKey = process.env.STRIPE_CONNECT_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
        if (stripeKey) {
          try {
            const stripe = new Stripe(stripeKey);
            await stripe.subscriptions.cancel(profile.stripe_subscription_id);
          } catch {
            // Subscription may already be cancelled — proceed anyway
          }
        }
        updates.stripe_subscription_id = null;
      }
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Send approval/rejection email when locator_status changes
    if (updates.locator_status && data) {
      try {
        const firstName = (data.full_name || "").split(" ")[0] || "there";
        if (updates.locator_status === "approved") {
          await sendLocatorApprovedEmail({ to: data.email, firstName });
        } else if (updates.locator_status === "rejected") {
          await sendLocatorRejectedEmail({ to: data.email, firstName });
        }
      } catch {
        // Email is best-effort
      }
    }

    // Keep operator_listings.featured in sync with profiles.featured
    if ("featured" in updates) {
      await supabaseAdmin
        .from("operator_listings")
        .update({ featured: updates.featured as boolean })
        .eq("operator_id", id);
    }

    // Audit log — coffee pricing tier assignment / reassignment.
    if ("coffee_pricing_tier_id" in updates) {
      const newTierId = (updates.coffee_pricing_tier_id as string | null) || null;
      if (newTierId !== previousTierId) {
        const tierIds = [previousTierId, newTierId].filter((v): v is string => !!v);
        const { data: tierRows } = tierIds.length > 0
          ? await supabaseAdmin
              .from("coffee_pricing_tiers")
              .select("id, tier_key, name")
              .in("id", tierIds)
          : { data: [] as Array<{ id: string; tier_key: string; name: string }> };
        const byId = new Map((tierRows || []).map((t) => [t.id, t]));
        await supabaseAdmin.from("audit_logs").insert({
          actor_id: adminId,
          action: "coffee_account_tier_reassigned",
          entity_type: "profiles",
          entity_id: id,
          before: previousTierId
            ? { coffee_pricing_tier_id: previousTierId, tier: byId.get(previousTierId) || null }
            : { coffee_pricing_tier_id: null },
          after: newTierId
            ? { coffee_pricing_tier_id: newTierId, tier: byId.get(newTierId) || null }
            : { coffee_pricing_tier_id: null },
          metadata: {
            user_email: data?.email || null,
            user_full_name: data?.full_name || null,
          },
        });
      }
    }

    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/admin/users/[id] — admin deletes a user.
 *
 * Strategy: try a hard delete first (clean removal of both the
 * profile row and the auth user). If the profile delete is blocked
 * by an FK constraint — because the account has referenced history
 * on orders, workflows, agreements, etc. — fall back to a soft
 * delete that redacts the PII, stamps deleted_at, and deletes the
 * auth user so the account cannot log in again. Historical rows
 * that FK to this profile stay valid and render as "Deleted User".
 *
 * Response includes `mode: "hard" | "soft"` so the admin UI can
 * tell whether the row was fully removed or just anonymized.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (id === adminId) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  // Attempt hard delete first.
  const { error: hardErr } = await supabaseAdmin
    .from("profiles")
    .delete()
    .eq("id", id);

  if (!hardErr) {
    // Auth soft-delete first so the row isn't physically removed
    // even when the FK chain would otherwise cascade. If that
    // fails, try the hard variant. Either flavor blocks sign-in.
    const soft = await supabaseAdmin.auth.admin.deleteUser(id, true);
    if (soft.error && !/not.*found/i.test(soft.error.message)) {
      const hard = await supabaseAdmin.auth.admin.deleteUser(id);
      if (hard.error && !/not.*found/i.test(hard.error.message)) {
        return NextResponse.json(
          { error: `Profile removed but auth user delete failed: ${hard.error.message}` },
          { status: 500 },
        );
      }
    }
    return NextResponse.json({ success: true, mode: "hard" });
  }

  // FK constraint violation → account has referenced history and
  // Postgres blocked the delete. Fall back to soft-delete.
  const isFkBlock =
    hardErr.code === "23503" ||
    /foreign key/i.test(hardErr.message) ||
    /violates.*constraint/i.test(hardErr.message);
  if (!isFkBlock) {
    return NextResponse.json({ error: hardErr.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const anonEmail = `deleted+${id.slice(0, 8)}@vendingconnector.local`;
  const { error: softErr } = await supabaseAdmin
    .from("profiles")
    .update({
      deleted_at: nowIso,
      full_name: "Deleted User",
      email: anonEmail,
      phone: null,
      address: null,
      city: null,
      state: null,
      zip: null,
      company_name: null,
      bio: null,
      website: null,
      // Kill any active feature flags so the deleted account can't
      // appear as featured or coffee-enabled anywhere.
      featured: false,
      coffee_access_enabled: false,
    })
    .eq("id", id);
  if (softErr) {
    return NextResponse.json(
      { error: `Soft delete failed: ${softErr.message}` },
      { status: 500 },
    );
  }

  // Auth user must be blocked so the account cannot sign in and
  // re-populate the anonymized profile. Prefer soft-delete
  // (shouldSoftDelete=true) — Supabase marks auth.users.deleted_at
  // instead of removing the row, which sidesteps the FK cascade
  // that just blocked the profile hard-delete. If soft-delete
  // itself is refused (older Supabase versions), try hard delete,
  // and if THAT fails ban the user via a very-long ban_duration
  // so they still can't log in.
  const softAuth = await supabaseAdmin.auth.admin.deleteUser(id, true);
  let authBlocked = !softAuth.error || /not.*found/i.test(softAuth.error.message);
  let authMessage: string | null = softAuth.error?.message ?? null;
  if (!authBlocked) {
    const hardAuth = await supabaseAdmin.auth.admin.deleteUser(id);
    if (!hardAuth.error || /not.*found/i.test(hardAuth.error.message)) {
      authBlocked = true;
      authMessage = null;
    } else {
      authMessage = hardAuth.error.message;
      // Last resort — ban the user for ~100 years. They stay in
      // auth.users but every sign-in is refused.
      const banned = await supabaseAdmin.auth.admin.updateUserById(id, {
        ban_duration: "876000h",
      });
      if (!banned.error) {
        authBlocked = true;
        authMessage = null;
      } else {
        authMessage = banned.error.message;
      }
    }
  }
  if (!authBlocked) {
    return NextResponse.json(
      {
        error:
          "Profile anonymized but the auth account could not be disabled. " +
          `Please disable the account manually in Supabase Auth. (${authMessage ?? "unknown error"})`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, mode: "soft" });
}
