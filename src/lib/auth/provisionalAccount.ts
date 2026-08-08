import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findOrCreateSalesAccount } from "@/lib/salesAccountResolver";

/**
 * Provisional account provisioning for guest checkout.
 *
 * When an unauthenticated visitor completes a checkout, we create a
 * real Supabase auth user + profile row on their behalf. The profile
 * is flagged is_provisional=true; the auth user has a random password
 * they never see. Downstream tables (coffee_orders.operator_id,
 * workflows.customer_id, sales_accounts.linked_user_id) just work
 * with the provisioned id — nothing needs to know the account was
 * created anonymously.
 *
 * The user later "claims" the account by clicking a signed magic link
 * from their order confirmation email, which lets them set a password
 * of their choosing. At that point we flip is_provisional=false and
 * stamp claimed_at.
 *
 * Idempotency: if an email already has a NON-provisional profile,
 * we return { existing: true } so the caller can either sign the user
 * in first or reject the checkout. We don't overwrite real accounts.
 * If the email has a PROVISIONAL profile (they abandoned a prior
 * checkout), we reuse that account — same person, same email.
 */

export interface ProvisionedAccount {
  userId: string;
  email: string;
  isNewProvisional: boolean;
  salesAccountId: string | null;
}

export interface ExistingAccount {
  existing: true;
  userId: string;
  email: string;
  requiresSignIn: boolean;
}

export type ProvisionResult = ProvisionedAccount | ExistingAccount;

export interface ProvisionInput {
  email: string;
  business_name: string;
  contact_name: string;
  phone: string;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  marketing_consent: boolean;
  referring_sales_rep_id?: string | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateRandomPassword(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function provisionAccountForGuestCheckout(
  input: ProvisionInput,
): Promise<ProvisionResult> {
  const email = normalizeEmail(input.email);

  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id, email, is_provisional")
    .ilike("email", email)
    .maybeSingle();

  if (existing && !existing.is_provisional) {
    return {
      existing: true,
      userId: existing.id,
      email: existing.email ?? email,
      requiresSignIn: true,
    };
  }

  let userId: string;
  let isNewProvisional = false;

  if (existing?.is_provisional) {
    userId = existing.id;
    await supabaseAdmin
      .from("profiles")
      .update({
        full_name: input.contact_name,
        phone: input.phone,
        address: input.address,
        city: input.city ?? null,
        state: input.state ?? null,
        zip: input.zip ?? null,
        company_name: input.business_name,
        marketing_consent: input.marketing_consent,
        marketing_consent_at: new Date().toISOString(),
      })
      .eq("id", userId);
  } else {
    const password = generateRandomPassword();
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: input.contact_name,
        phone: input.phone,
        address: input.address,
        city: input.city,
        state: input.state,
        zip: input.zip,
        role: "operator",
        provider: "guest_checkout",
        provisional: true,
      },
    });

    if (createErr || !created.user) {
      throw new Error(createErr?.message || "Failed to provision auth user");
    }

    userId = created.user.id;

    const nowIso = new Date().toISOString();
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,
          full_name: input.contact_name,
          email,
          phone: input.phone,
          address: input.address,
          city: input.city ?? null,
          state: input.state ?? null,
          zip: input.zip ?? null,
          role: "operator",
          company_name: input.business_name,
          email_verified: false,
          is_provisional: true,
          provisional_created_at: nowIso,
          marketing_consent: input.marketing_consent,
          marketing_consent_at: nowIso,
        },
        { onConflict: "id" },
      );

    if (profileErr) {
      throw new Error(`Failed to write provisional profile: ${profileErr.message}`);
    }

    isNewProvisional = true;
  }

  let salesAccountId: string | null = null;
  try {
    const account = await findOrCreateSalesAccount({
      business_name: input.business_name,
      contact_name: input.contact_name,
      phone: input.phone,
      email,
      address: input.address,
      notes: `Auto-created from guest checkout`,
      created_by: input.referring_sales_rep_id ?? null,
      assigned_to: input.referring_sales_rep_id ?? null,
    });
    salesAccountId = account?.id ?? null;
  } catch (e) {
    console.error("[provisionAccountForGuestCheckout] sales account link failed:", e);
  }

  return {
    userId,
    email,
    isNewProvisional,
    salesAccountId,
  };
}

/**
 * Claim a provisional account — flip is_provisional=false, stamp
 * claimed_at, mark email verified, and set the user-chosen password.
 * Called from the password-set magic-link handler.
 */
export async function claimProvisionalAccount(
  userId: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const { data: profile, error: fetchErr } = await supabaseAdmin
    .from("profiles")
    .select("id, is_provisional")
    .eq("id", userId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!profile) throw new Error("Account not found");
  if (!profile.is_provisional) {
    throw new Error("Account has already been claimed");
  }

  const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
    email_confirm: true,
  });

  if (pwErr) throw new Error(`Failed to set password: ${pwErr.message}`);

  await supabaseAdmin
    .from("profiles")
    .update({
      is_provisional: false,
      claimed_at: new Date().toISOString(),
      email_verified: true,
    })
    .eq("id", userId);
}

/**
 * Cryptographically strong opaque tokens for the two guest checkout
 * magic links. 32 bytes of base64url — no collision risk at our scale.
 */
export function generateGuestToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function guestTokenExpiry(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
