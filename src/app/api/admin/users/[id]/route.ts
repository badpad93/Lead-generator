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
    ];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
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

    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/admin/users/[id] — admin deletes a user */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Prevent admin from deleting themselves
  if (id === adminId) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  // Delete profile (cascade will handle related data via DB constraints)
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .delete()
    .eq("id", id);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Also delete the auth user
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
