/**
 * Phase 2.6 — Marketplace email notifications.
 *
 * All email-sends flow through sendNotification, which:
 *   1. Skips if the recipient turned off this event type.
 *   2. Skips if we already sent this dedup_key within RATE_LIMIT_MINUTES.
 *   3. Sends via Resend + records a marketplace_notifications row.
 *
 * Per-event helpers (notifyPartnerContractOpened, etc.) resolve the recipients,
 * render the HTML, and delegate to sendNotification.
 */

import { Resend } from "resend";
import { supabaseAdmin } from "./supabaseAdmin";
import { isPartnerEligibleForContract } from "./marketplaceEligibility";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
const ADMIN_NOTIFICATIONS_EMAIL =
  process.env.MARKETPLACE_ADMIN_NOTIFICATIONS_EMAIL || "james@apexaivending.com";
const RATE_LIMIT_MINUTES = 15;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

export type EventType =
  | "partner_contract_opened"
  | "admin_submission_created"
  | "operator_submission_ready"
  | "partner_submission_reviewed"
  | "partner_operator_decided"
  | "partner_payout_sent";

/** Every event defaults to on unless the recipient explicitly turns it off. */
function isEventEnabled(prefs: Record<string, boolean> | null, event: EventType): boolean {
  if (!prefs) return true;
  const v = prefs[event];
  return v !== false;
}

interface SendArgs {
  event: EventType;
  recipientEmail: string;
  recipientProfileId: string | null;
  subject: string;
  html: string;
  dedupKey: string;
  contractId?: string | null;
  submissionId?: string | null;
  payoutId?: string | null;
  invoiceId?: string | null;
  metadata?: Record<string, unknown>;
}

async function loadPreferences(profileId: string | null): Promise<Record<string, boolean> | null> {
  if (!profileId) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("notification_preferences")
    .eq("id", profileId)
    .maybeSingle();
  return (data?.notification_preferences || {}) as Record<string, boolean>;
}

async function alreadySentRecently(dedupKey: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_MINUTES * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("marketplace_notifications")
    .select("id")
    .eq("dedup_key", dedupKey)
    .eq("status", "sent")
    .gte("sent_at", cutoff)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function recordNotification(row: {
  recipient_profile_id: string | null;
  recipient_email: string;
  event_type: EventType;
  dedup_key: string;
  subject: string;
  status: "sent" | "skipped_preference" | "skipped_rate_limit" | "failed";
  error?: string;
  contract_id?: string | null;
  submission_id?: string | null;
  payout_id?: string | null;
  invoice_id?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("marketplace_notifications").insert({
    ...row,
    error: row.error?.slice(0, 500),
    metadata: row.metadata || null,
  });
}

export async function sendNotification(args: SendArgs): Promise<{ status: string; error?: string }> {
  // 1. Preferences
  const prefs = await loadPreferences(args.recipientProfileId);
  if (!isEventEnabled(prefs, args.event)) {
    await recordNotification({
      recipient_profile_id: args.recipientProfileId,
      recipient_email: args.recipientEmail,
      event_type: args.event,
      dedup_key: args.dedupKey,
      subject: args.subject,
      status: "skipped_preference",
      contract_id: args.contractId,
      submission_id: args.submissionId,
      payout_id: args.payoutId,
      invoice_id: args.invoiceId,
      metadata: args.metadata,
    });
    return { status: "skipped_preference" };
  }

  // 2. Rate limit
  if (await alreadySentRecently(args.dedupKey)) {
    await recordNotification({
      recipient_profile_id: args.recipientProfileId,
      recipient_email: args.recipientEmail,
      event_type: args.event,
      dedup_key: args.dedupKey,
      subject: args.subject,
      status: "skipped_rate_limit",
      contract_id: args.contractId,
      submission_id: args.submissionId,
      payout_id: args.payoutId,
      invoice_id: args.invoiceId,
      metadata: args.metadata,
    });
    return { status: "skipped_rate_limit" };
  }

  // 3. Send
  const resend = getResend();
  if (!resend) {
    await recordNotification({
      recipient_profile_id: args.recipientProfileId,
      recipient_email: args.recipientEmail,
      event_type: args.event,
      dedup_key: args.dedupKey,
      subject: args.subject,
      status: "failed",
      error: "RESEND_API_KEY not configured",
      contract_id: args.contractId,
      submission_id: args.submissionId,
      payout_id: args.payoutId,
      invoice_id: args.invoiceId,
      metadata: args.metadata,
    });
    return { status: "failed", error: "RESEND_API_KEY not configured" };
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: args.recipientEmail,
      subject: args.subject,
      html: args.html,
    });
    await recordNotification({
      recipient_profile_id: args.recipientProfileId,
      recipient_email: args.recipientEmail,
      event_type: args.event,
      dedup_key: args.dedupKey,
      subject: args.subject,
      status: "sent",
      contract_id: args.contractId,
      submission_id: args.submissionId,
      payout_id: args.payoutId,
      invoice_id: args.invoiceId,
      metadata: args.metadata,
    });
    return { status: "sent" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordNotification({
      recipient_profile_id: args.recipientProfileId,
      recipient_email: args.recipientEmail,
      event_type: args.event,
      dedup_key: args.dedupKey,
      subject: args.subject,
      status: "failed",
      error: msg,
      contract_id: args.contractId,
      submission_id: args.submissionId,
      payout_id: args.payoutId,
      invoice_id: args.invoiceId,
      metadata: args.metadata,
    });
    return { status: "failed", error: msg };
  }
}

// ─── HTML shell ──────────────────────────────────────────────────────────

function renderShell({
  heading,
  intro,
  ctaLabel,
  ctaHref,
  facts,
  footer,
}: {
  heading: string;
  intro: string;
  ctaLabel?: string;
  ctaHref?: string;
  facts?: Array<[string, string]>;
  footer?: string;
}): string {
  const factsHtml = (facts || [])
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${k}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111;font-size:13px;font-weight:600;">${v}</td>
      </tr>`,
    )
    .join("");
  const cta = ctaLabel && ctaHref
    ? `<div style="text-align:center;margin:32px 0;">
        <a href="${ctaHref}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:16px;">${ctaLabel}</a>
      </div>`
    : "";
  return `
<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:40px 24px;color:#111827;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="color:#16a34a;font-size:24px;margin:0;">Vending Connector</h1>
    <p style="color:#6b7280;font-size:14px;margin:8px 0 0;">Placement Marketplace</p>
  </div>
  <h2 style="color:#111;font-size:18px;margin-bottom:12px;">${heading}</h2>
  <p style="font-size:14px;color:#374151;line-height:1.6;">${intro}</p>
  ${factsHtml ? `<table style="width:100%;border-collapse:collapse;margin:20px 0;">${factsHtml}</table>` : ""}
  ${cta}
  ${footer ? `<p style="font-size:12px;color:#9ca3af;margin-top:24px;">${footer}</p>` : ""}
</div>`;
}

// ─── Per-event helpers ───────────────────────────────────────────────────

interface ContractCore {
  id: string;
  title: string;
  tier: number;
  partner_payout: number;
  market_state: string | null;
  market_city: string | null;
  machine_type: string | null;
  locations_needed: number;
  deadline_at: string | null;
  status: string;
}

/**
 * Fan out to every eligible partner when a contract opens. Called on both
 * "create-and-publish" and "PATCH action=open" flows. Idempotent per
 * (contract, partner) via dedup key.
 */
export async function notifyPartnerContractOpened(contractId: string): Promise<void> {
  const { data: contract } = await supabaseAdmin
    .from("placement_contracts")
    .select("id, title, tier, partner_payout, market_state, market_city, machine_type, locations_needed, deadline_at, status")
    .eq("id", contractId)
    .maybeSingle<ContractCore>();
  if (!contract || contract.status !== "open") return;

  const { data: partners } = await supabaseAdmin
    .from("placement_partners")
    .select("id")
    .eq("active", true)
    .eq("onboarding_complete", true);

  for (const p of partners || []) {
    const eligibility = await isPartnerEligibleForContract(p.id, contract.id);
    if (!eligibility.eligible) continue;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", p.id)
      .maybeSingle();
    if (!profile?.email) continue;

    const facts: Array<[string, string]> = [
      ["Payout", `$${Number(contract.partner_payout).toLocaleString()}/location`],
      ["Market", [contract.market_city, contract.market_state].filter(Boolean).join(", ") || "Any"],
      ["Machine", contract.machine_type || "VendEra AI Machine"],
      ["Slots", String(contract.locations_needed)],
    ];
    if (contract.deadline_at) {
      facts.push(["Deadline", new Date(contract.deadline_at).toLocaleDateString()]);
    }

    const html = renderShell({
      heading: `New contract for you: ${contract.title}`,
      intro: `A new Tier ${contract.tier} contract just opened that matches your territory and industries. First to submit qualified locations gets paid — grab it before someone else does.`,
      ctaLabel: "View Contract",
      ctaHref: `${SITE_URL}/placement/contracts/${contract.id}`,
      facts,
      footer: "You can turn off contract alerts in your placement settings.",
    });

    await sendNotification({
      event: "partner_contract_opened",
      recipientEmail: profile.email,
      recipientProfileId: profile.id,
      subject: `New Tier ${contract.tier} contract available — $${Number(contract.partner_payout).toLocaleString()}/location`,
      html,
      dedupKey: `partner_contract_opened:${contract.id}:${profile.id}`,
      contractId: contract.id,
    });
  }
}

/** Admin alert when a partner submits a candidate location. */
export async function notifyAdminSubmissionCreated(submissionId: string): Promise<void> {
  const { data: submission } = await supabaseAdmin
    .from("placement_submissions")
    .select("id, business_name, city, state, contract_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission) return;

  const { data: contract } = await supabaseAdmin
    .from("placement_contracts")
    .select("title, tier")
    .eq("id", submission.contract_id)
    .maybeSingle();

  const html = renderShell({
    heading: "New submission awaiting review",
    intro: "A placement partner just submitted a candidate location. Approve or request changes to move it into the operator's inbox.",
    ctaLabel: "Review Submission",
    ctaHref: `${SITE_URL}/admin/marketplace/submissions/${submission.id}`,
    facts: [
      ["Business", submission.business_name],
      ["Location", [submission.city, submission.state].filter(Boolean).join(", ") || "—"],
      ["Contract", contract?.title || "—"],
      ["Tier", `Tier ${contract?.tier || "?"}`],
    ],
    footer: "You're receiving this because you're the marketplace admin contact.",
  });

  await sendNotification({
    event: "admin_submission_created",
    recipientEmail: ADMIN_NOTIFICATIONS_EMAIL,
    recipientProfileId: null,
    subject: `New submission: ${submission.business_name}`,
    html,
    dedupKey: `admin_submission_created:${submission.id}`,
    submissionId: submission.id,
    contractId: submission.contract_id,
  });
}

/** Operator alert once admin approves. This is the "location ready to review" ping. */
export async function notifyOperatorSubmissionReady(submissionId: string): Promise<void> {
  const { data: submission } = await supabaseAdmin
    .from("placement_submissions")
    .select("id, business_name, city, state, contract_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission) return;

  const { data: contract } = await supabaseAdmin
    .from("placement_contracts")
    .select("title, tier, operator_profile_id, source_agreement_id")
    .eq("id", submission.contract_id)
    .maybeSingle();
  if (!contract) return;

  // Resolve operator email — profile first, then agreement fallback.
  let operatorEmail: string | null = null;
  let operatorProfileId: string | null = contract.operator_profile_id || null;
  if (operatorProfileId) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", operatorProfileId)
      .maybeSingle();
    operatorEmail = profile?.email || null;
  }
  if (!operatorEmail && contract.source_agreement_id) {
    const { data: ag } = await supabaseAdmin
      .from("purchase_agreements")
      .select("operator_email")
      .eq("id", contract.source_agreement_id)
      .maybeSingle();
    operatorEmail = ag?.operator_email || null;
  }
  if (!operatorEmail) return;

  const html = renderShell({
    heading: "A new location is ready for your review",
    intro: "Our placement network sourced a candidate location for you. Accept to lock the slot and start install, or reject to pass.",
    ctaLabel: "Review Location",
    ctaHref: `${SITE_URL}/operator/marketplace/${submission.id}`,
    facts: [
      ["Business", submission.business_name],
      ["Location", [submission.city, submission.state].filter(Boolean).join(", ") || "—"],
      ["Contract", contract.title],
    ],
    footer: "You'll only see location content — never the partner's identity.",
  });

  await sendNotification({
    event: "operator_submission_ready",
    recipientEmail: operatorEmail,
    recipientProfileId: operatorProfileId,
    subject: `Location ready to review — ${submission.business_name}`,
    html,
    dedupKey: `operator_submission_ready:${submission.id}`,
    submissionId: submission.id,
    contractId: submission.contract_id,
  });
}

/**
 * Partner update after admin review action (approve / request_changes / reject).
 * Only used for non-approve outcomes — approve triggers the operator ping (the
 * partner sees it via the operator decision hook instead).
 */
export async function notifyPartnerSubmissionReviewed(
  submissionId: string,
  action: "approve" | "request_changes" | "reject",
  note: string | null,
): Promise<void> {
  const { data: submission } = await supabaseAdmin
    .from("placement_submissions")
    .select("id, business_name, partner_id, contract_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission) return;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("id", submission.partner_id)
    .maybeSingle();
  if (!profile?.email) return;

  const outcome =
    action === "approve"
      ? "was approved and is now with the operator"
      : action === "reject"
        ? "was rejected"
        : "needs changes before it can move forward";

  const html = renderShell({
    heading: `Your submission ${outcome}`,
    intro:
      action === "approve"
        ? "Nice work — the operator can accept or reject from here. We'll email you when they decide."
        : action === "request_changes"
          ? "Admin has left feedback for you. Update the submission and it goes back into review."
          : "Admin has closed this submission. You can submit another location on the same contract if you like.",
    ctaLabel: "Open Submission",
    ctaHref: `${SITE_URL}/placement/submissions/${submission.id}`,
    facts: note ? [["Admin note", note]] : undefined,
  });

  await sendNotification({
    event: "partner_submission_reviewed",
    recipientEmail: profile.email,
    recipientProfileId: profile.id,
    subject: `Submission update — ${submission.business_name}`,
    html,
    dedupKey: `partner_submission_reviewed:${submission.id}:${action}`,
    submissionId: submission.id,
    contractId: submission.contract_id,
    metadata: { action, note },
  });
}

/** Partner alert when the operator accepts or rejects. */
export async function notifyPartnerOperatorDecided(
  submissionId: string,
  decision: "accepted" | "rejected",
): Promise<void> {
  const { data: submission } = await supabaseAdmin
    .from("placement_submissions")
    .select("id, business_name, partner_id, contract_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission) return;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("id", submission.partner_id)
    .maybeSingle();
  if (!profile?.email) return;

  const { data: contract } = await supabaseAdmin
    .from("placement_contracts")
    .select("partner_payout")
    .eq("id", submission.contract_id)
    .maybeSingle();

  const heading = decision === "accepted" ? "Operator accepted your location!" : "Operator passed on this one";
  const intro =
    decision === "accepted"
      ? `Great work. Your $${Number(contract?.partner_payout || 0).toLocaleString()} payout is being queued to QuickBooks. Keep an eye out for a Bill in the next few minutes.`
      : "The operator passed on this location. If the contract still has open slots, you can submit another candidate.";

  const html = renderShell({
    heading,
    intro,
    ctaLabel: "Open Submission",
    ctaHref: `${SITE_URL}/placement/submissions/${submission.id}`,
  });

  await sendNotification({
    event: "partner_operator_decided",
    recipientEmail: profile.email,
    recipientProfileId: profile.id,
    subject: decision === "accepted" ? `Accepted — ${submission.business_name}` : `Not this one — ${submission.business_name}`,
    html,
    dedupKey: `partner_operator_decided:${submission.id}:${decision}`,
    submissionId: submission.id,
    contractId: submission.contract_id,
  });
}

/** Partner confirmation once the payout Bill lands in QB. */
export async function notifyPartnerPayoutSent(payoutId: string): Promise<void> {
  const { data: payout } = await supabaseAdmin
    .from("marketplace_payouts")
    .select("id, partner_id, amount, qb_bill_id, submission_id, contract_id")
    .eq("id", payoutId)
    .maybeSingle();
  if (!payout) return;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("id", payout.partner_id)
    .maybeSingle();
  if (!profile?.email) return;

  const html = renderShell({
    heading: `Payout on its way — $${Number(payout.amount).toLocaleString()}`,
    intro: "Your placement payout was pushed to QuickBooks as a Bill. It'll be paid on our normal payment cycle. You'll get a second email once we mark it paid.",
    ctaLabel: "View Submissions",
    ctaHref: `${SITE_URL}/placement/submissions`,
    facts: payout.qb_bill_id ? [["QuickBooks Bill", payout.qb_bill_id]] : undefined,
  });

  await sendNotification({
    event: "partner_payout_sent",
    recipientEmail: profile.email,
    recipientProfileId: profile.id,
    subject: `Payout queued — $${Number(payout.amount).toLocaleString()}`,
    html,
    dedupKey: `partner_payout_sent:${payout.id}`,
    payoutId: payout.id,
    submissionId: payout.submission_id,
    contractId: payout.contract_id,
  });
}
