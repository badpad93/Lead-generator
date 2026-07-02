import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createAndSendVerificationEmail } from "@/lib/emailVerification";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const firstName = String(body.first_name || "").trim();
    const lastName = String(body.last_name || "").trim();
    const companyName = String(body.company_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "");
    const role = String(body.role || "operator").trim();

    if (!firstName) return NextResponse.json({ error: "First name is required" }, { status: 400 });
    if (!lastName) return NextResponse.json({ error: "Last name is required" }, { status: 400 });
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }
    if (!phone) return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    if (phone.replace(/\D/g, "").length < 10) {
      return NextResponse.json({ error: "Please enter a valid phone number" }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Check if a user with this email already exists (OAuth or email/password)
    const { data: existingList } = await supabaseAdmin.auth.admin.listUsers();
    const existing = existingList?.users?.find((u) => u.email?.toLowerCase() === email);
    if (existing) {
      return NextResponse.json(
        {
          error:
            "An account already exists with this email. Please sign in using your existing method or contact support to add password login.",
          code: "ACCOUNT_EXISTS",
        },
        { status: 409 },
      );
    }

    const fullName = `${firstName} ${lastName}`.trim();

    // Create the Supabase auth user. We start with email_confirm=false so they
    // need to click our verification email before email_confirmed_at is set.
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: {
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        phone,
        role,
        provider: "email",
      },
    });

    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message || "Failed to create account" },
        { status: 500 },
      );
    }

    const userId = created.user.id;

    // Ensure profile row reflects our intended values (handle_new_user trigger
    // may have inserted a baseline).
    await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,
          full_name: fullName,
          email,
          phone,
          role,
          company_name: companyName || null,
          email_verified: false,
        },
        { onConflict: "id" },
      );

    // Send verification email
    const verifyResult = await createAndSendVerificationEmail({
      userId,
      email,
      firstName,
    });

    if (!verifyResult.ok) {
      // Account was created but email failed — log and return success anyway.
      // The user can resend from /resend-verification.
      console.error("[signup-email] verification email failed:", verifyResult.error);
    }

    return NextResponse.json({ ok: true, user_id: userId, email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
