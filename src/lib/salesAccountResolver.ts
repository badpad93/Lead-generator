/**
 * findOrCreateSalesAccount — the ONE way to obtain a sales_accounts.id
 * from customer identity fields.
 *
 * Root problem this exists to solve: sales_accounts had no dedup guard,
 * so every intake flow (rep-typed accounts, lead intake, coffee mirror,
 * financing, request-location, agreements, etc.) created its own row
 * for the same real customer. Result: `account_id` was a row-identity
 * key, not a customer-identity key, and cross-flow metrics like close
 * rate could never match.
 *
 * Contract:
 *   - Given identity fields, return the id of the ONE canonical row.
 *   - If a match already exists (by normalized email, or by normalized
 *     business_name + normalized phone), return it — do not INSERT.
 *   - If nothing matches, INSERT a new row with the passed fields and
 *     return its id.
 *   - Existing rows are NOT overwritten by this call. Pass
 *     `patchMissing: true` to opt in to updating null-or-empty fields
 *     on the existing row from the new inputs.
 *
 * Race-safety: the underlying partial indexes (migration 135) are
 * NON-UNIQUE while historical duplicates exist. Two callers racing on
 * the same-identity insert can therefore each produce a fresh row.
 * This is an accepted trade-off until the admin merge UI drives
 * duplicates to zero and a follow-up migration promotes the indexes
 * to UNIQUE. In practice the race window is tiny; the admin merge UI
 * will always be available to clean up if it happens.
 */

import { supabaseAdmin } from "./supabaseAdmin";

export interface AccountIdentity {
  email?: string | null;
  business_name?: string | null;
  phone?: string | null;
  contact_name?: string | null;
  address?: string | null;
  notes?: string | null;
  entity_type?: string | null;
  notification_emails?: string | null;
  market_assignment?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
}

export interface ResolvedAccount {
  id: string;
  created: boolean;
  matchedBy: "email" | "name+phone" | "name" | null;
}

function normEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  return t || null;
}

function normName(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim().toLowerCase().replace(/\s+/g, " ");
  return t || null;
}

function normPhone(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.replace(/\D/g, "");
  return t || null;
}

export async function findOrCreateSalesAccount(
  identity: AccountIdentity,
  options: { patchMissing?: boolean } = {},
): Promise<ResolvedAccount> {
  const email = normEmail(identity.email);
  const name = normName(identity.business_name);
  const phone = normPhone(identity.phone);

  // We need at least SOMETHING to look up on. If the caller has neither
  // an email nor a business name, we can't dedup — just insert.
  const canLookup = !!email || !!name;

  let matched:
    | { id: string; email: string | null; business_name: string | null; phone: string | null; contact_name: string | null; address: string | null; notes: string | null }
    | null = null;
  let matchedBy: ResolvedAccount["matchedBy"] = null;

  if (canLookup) {
    // 1. Email match (highest confidence).
    if (email) {
      const { data } = await supabaseAdmin
        .from("sales_accounts")
        .select("id, email, business_name, phone, contact_name, address, notes")
        .eq("normalized_email", email)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1);
      if (data && data.length > 0) {
        matched = data[0];
        matchedBy = "email";
      }
    }

    // 2. Business name + phone.
    if (!matched && name && phone) {
      const { data } = await supabaseAdmin
        .from("sales_accounts")
        .select("id, email, business_name, phone, contact_name, address, notes")
        .eq("normalized_business_name", name)
        .eq("normalized_phone", phone)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1);
      if (data && data.length > 0) {
        matched = data[0];
        matchedBy = "name+phone";
      }
    }

    // 3. Business name alone (last resort — deliberately not matched
    // when phone was provided but didn't match, since that's stronger
    // evidence of a different customer).
    if (!matched && name && !phone) {
      const { data } = await supabaseAdmin
        .from("sales_accounts")
        .select("id, email, business_name, phone, contact_name, address, notes")
        .eq("normalized_business_name", name)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1);
      if (data && data.length > 0) {
        matched = data[0];
        matchedBy = "name";
      }
    }
  }

  if (matched) {
    if (options.patchMissing) {
      const patch: Record<string, unknown> = {};
      if (!matched.email && identity.email) patch.email = identity.email;
      if (!matched.business_name && identity.business_name) patch.business_name = identity.business_name;
      if (!matched.phone && identity.phone) patch.phone = identity.phone;
      if (!matched.contact_name && identity.contact_name) patch.contact_name = identity.contact_name;
      if (!matched.address && identity.address) patch.address = identity.address;
      if (Object.keys(patch).length > 0) {
        await supabaseAdmin.from("sales_accounts").update(patch).eq("id", matched.id);
      }
    }
    return { id: matched.id, created: false, matchedBy };
  }

  // Insert new. business_name is NOT NULL on sales_accounts; fall back
  // to email-local-part or "(unnamed)" so the insert doesn't reject.
  const bizName = identity.business_name?.trim()
    || (identity.email ? identity.email.split("@")[0] : null)
    || "(unnamed)";

  const { data: created, error } = await supabaseAdmin
    .from("sales_accounts")
    .insert({
      business_name: bizName,
      contact_name: identity.contact_name ?? null,
      email: identity.email ?? null,
      phone: identity.phone ?? null,
      address: identity.address ?? null,
      notes: identity.notes ?? null,
      entity_type: identity.entity_type ?? null,
      notification_emails: identity.notification_emails ?? null,
      market_assignment: identity.market_assignment ?? null,
      assigned_to: identity.assigned_to ?? null,
      created_by: identity.created_by ?? null,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw error ?? new Error("findOrCreateSalesAccount: insert failed");
  }

  return { id: created.id, created: true, matchedBy: null };
}
