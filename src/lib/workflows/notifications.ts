/**
 * Workflows — email notification service.
 *
 * Reads workflow_notification_rules for the given trigger event, then
 * dispatches through the existing Resend client. Every send is logged
 * to workflow_notification_log; when a rule has send_once=true the
 * partial unique index on the log table blocks duplicate deliveries
 * even under webhook retry storms.
 */

import { Resend } from "resend";
import { supabaseAdmin } from "../supabaseAdmin";
import type { WorkflowRow } from "./types";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export type NotificationTrigger =
  | "workflow.created"
  | "workflow.completed"
  | "workflow.cancelled"
  | "workflow.reopened"
  | "customer.action_required"
  | "customer.approval_needed"
  | "deadline.changed"
  | "machine.shipped"
  | "machine.delivered"
  | "location.secured"
  | "location.completed"
  | "financing.pre_approved"
  | "financing.approved"
  | "financing.funded"
  | "financing.declined"
  | "coffee.equipment_shipped"
  | "coffee.equipment_delivered"
  | "coffee.installation_scheduled"
  | "assignment.created"
  | "assignment.changed"
  | "deadline.due_soon"
  | "deadline.overdue";

interface DispatchArgs {
  workflowId: string;
  trigger: NotificationTrigger;
  stageKey?: string;
  extraContext?: Record<string, unknown>;
}

export async function dispatchNotification(args: DispatchArgs): Promise<void> {
  const { data: workflow } = await supabaseAdmin
    .from("workflows")
    .select("*")
    .eq("id", args.workflowId)
    .maybeSingle();
  if (!workflow) return;

  // Find matching rules (workflow_type-specific OR global; stage-specific OR any).
  const { data: allRules } = await supabaseAdmin
    .from("workflow_notification_rules")
    .select("*")
    .eq("trigger_event", args.trigger)
    .eq("enabled", true);

  const rules = (allRules ?? []).filter(
    (r) => (!r.workflow_type || r.workflow_type === workflow.workflow_type) && (!r.stage_key || r.stage_key === args.stageKey),
  );

  if (rules.length === 0) return;

  for (const rule of rules) {
    const recipients = await resolveRecipients(rule, workflow);
    for (const recipient of recipients) {
      if (rule.send_once) {
        // Preflight the send-once index — the DB partial unique index
        // is the ultimate guarantee, but this avoids a wasted Resend
        // call for a known duplicate.
        const { data: dupe } = await supabaseAdmin
          .from("workflow_notification_log")
          .select("id")
          .eq("workflow_id", workflow.id)
          .eq("trigger_event", args.trigger)
          .eq("template_key", rule.template_key)
          .eq("recipient", recipient.email)
          .eq("status", "sent")
          .maybeSingle();
        if (dupe) continue;
      }

      try {
        const { subject, html } = renderTemplate(rule.template_key, workflow, {
          audience: recipient.audience,
          ...args.extraContext,
        });
        const send = await getResend().emails.send({
          from: FROM_EMAIL,
          to: recipient.email,
          subject,
          html,
        });
        await supabaseAdmin.from("workflow_notification_log").insert({
          workflow_id: workflow.id,
          rule_id: rule.id,
          trigger_event: args.trigger,
          template_key: rule.template_key,
          recipient: recipient.email,
          stage_key: args.stageKey ?? null,
          resend_message_id: send.data?.id ?? null,
          status: "sent",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        // Duplicate-key from partial unique index → skipped_duplicate
        const isDup = message.includes("uq_workflow_notification_send_once");
        await supabaseAdmin.from("workflow_notification_log").insert({
          workflow_id: workflow.id,
          rule_id: rule.id,
          trigger_event: args.trigger,
          template_key: rule.template_key,
          recipient: recipient.email,
          stage_key: args.stageKey ?? null,
          status: isDup ? "skipped_duplicate" : "failed",
          failure_reason: isDup ? null : message.slice(0, 500),
        });
      }
    }
  }
}

interface Recipient {
  email: string;
  audience: "customer" | "assignee" | "team";
}

async function resolveRecipients(
  rule: {
    send_to_customer: boolean;
    send_to_assignee: boolean;
    send_to_team_email: string | null;
  },
  workflow: WorkflowRow,
): Promise<Recipient[]> {
  const recipients: Recipient[] = [];

  if (rule.send_to_customer) {
    const { data: customer } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", workflow.customer_id)
      .maybeSingle();
    if (customer?.email) recipients.push({ email: customer.email, audience: "customer" });
  }

  if (rule.send_to_assignee && workflow.assigned_user_id) {
    const { data: assignee } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", workflow.assigned_user_id)
      .maybeSingle();
    if (assignee?.email) recipients.push({ email: assignee.email, audience: "assignee" });
  } else if (rule.send_to_assignee && !workflow.assigned_user_id) {
    // Fall back to the team email for the workflow's primary_team.
    const teamEmail = teamEmailFor(workflow.primary_team);
    if (teamEmail) recipients.push({ email: teamEmail, audience: "team" });
  }

  if (rule.send_to_team_email) {
    recipients.push({ email: rule.send_to_team_email, audience: "team" });
  }

  return recipients;
}

function teamEmailFor(team: string | null): string | null {
  switch (team) {
    case "fulfillment":
      return process.env.WORKFLOWS_TEAM_EMAIL_FULFILLMENT ?? null;
    case "locations":
      return process.env.WORKFLOWS_TEAM_EMAIL_LOCATIONS ?? null;
    case "financing":
      return process.env.WORKFLOWS_TEAM_EMAIL_FINANCING ?? null;
    case "coffee":
      return process.env.WORKFLOWS_TEAM_EMAIL_COFFEE ?? null;
    default:
      return null;
  }
}

// ─── Template renderer ───────────────────────────────────────────────────
interface RenderContext {
  audience: "customer" | "assignee" | "team";
  [k: string]: unknown;
}

function renderTemplate(
  templateKey: string,
  workflow: WorkflowRow,
  context: RenderContext,
): { subject: string; html: string } {
  const isCustomer = context.audience === "customer";
  const detailUrl = detailUrlFor(workflow, isCustomer);

  // Templates that are shared shape — customer + employee copies differ
  // in tone. Rather than hand-maintain a template per (event × audience),
  // the audience switches the wording; content is data-driven.
  const {
    title,
    body,
    ctaLabel = "View details",
  } = TEMPLATES[templateKey]?.(workflow, context) ?? {
    title: `Workflow update: ${workflow.title}`,
    body: `Your workflow "${workflow.title}" has been updated.`,
  };

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111827">
      <div style="text-align:center;margin-bottom:24px">
        <h1 style="color:#16a34a;margin:0;font-size:22px">Vending Connector</h1>
      </div>
      <h2 style="font-size:18px;margin:0 0 12px">${escape(title)}</h2>
      <div style="font-size:14px;line-height:1.6;color:#374151">${body}</div>
      <p style="margin-top:24px">
        <a href="${detailUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">
          ${escape(ctaLabel)}
        </a>
      </p>
      <p style="font-size:12px;color:#9ca3af;margin-top:32px">
        Workflow ${escape(workflow.workflow_number)}
      </p>
    </div>
  `;

  return { subject: title, html };
}

function detailUrlFor(workflow: WorkflowRow, isCustomer: boolean): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
  const path = isCustomer ? `/account/workflows/${workflow.id}` : `/sales/workflows/${workflow.id}`;
  return `${base}${path}`;
}

function escape(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

type TemplateFn = (workflow: WorkflowRow, context: RenderContext) => { title: string; body: string; ctaLabel?: string };

const TEMPLATES: Record<string, TemplateFn> = {
  workflow_created_customer: (w) => ({
    title: `${w.title} — we're getting started`,
    body: `<p>Thanks for your order! We've received your <strong>${escape(w.title)}</strong> and started tracking it. You can follow progress at any time from the link below.</p>${
      w.quantity_purchased > 0 ? `<p style="margin-top:8px"><strong>Quantity:</strong> ${w.quantity_purchased}</p>` : ""
    }`,
    ctaLabel: "Track your order",
  }),
  machine_shipped_customer: (w, ctx) => ({
    title: `Your machines have shipped — ${w.workflow_number}`,
    body: `<p>Your order for <strong>${escape(w.title)}</strong> has shipped.</p>${
      ctx.trackingSummary ? `<p style="margin-top:8px">${escape(String(ctx.trackingSummary))}</p>` : ""
    }`,
    ctaLabel: "View tracking",
  }),
  machine_delivered_customer: (w) => ({
    title: `Machines delivered — ${w.workflow_number}`,
    body: `<p>Your order for <strong>${escape(w.title)}</strong> has been delivered. Installation and activation come next.</p>`,
    ctaLabel: "See progress",
  }),
  location_secured_customer: (w) => ({
    title: `A location has been secured — ${w.title}`,
    body: `<p>Good news! Our team has secured a location for you. Progress on your location services order:</p><p><strong>${w.quantity_completed} of ${w.quantity_purchased} locations secured</strong>.</p>`,
    ctaLabel: "View details",
  }),
  location_completed_customer: (w) => ({
    title: `Location services complete — ${w.workflow_number}`,
    body: `<p>All ${w.quantity_purchased} locations for your <strong>${escape(w.title)}</strong> order have been secured and completed.</p>`,
    ctaLabel: "View summary",
  }),
  financing_approved_customer: () => ({
    title: `Your financing has been approved`,
    body: `<p>Your SBA financing application has been approved. Funding will follow shortly — we'll email you the moment funds are disbursed.</p>`,
    ctaLabel: "View application",
  }),
  financing_funded_customer: () => ({
    title: `Your financing has been funded`,
    body: `<p>Funds from your SBA financing have been disbursed. This closes your financing workflow.</p>`,
    ctaLabel: "View summary",
  }),
  workflow_completed_customer: (w) => ({
    title: `${w.title} — complete!`,
    body: `<p>Your <strong>${escape(w.title)}</strong> order is fully complete. Thank you for choosing Vending Connector.</p>`,
    ctaLabel: "View summary",
  }),
  action_required_customer: (w, ctx) => ({
    title: `Action needed — ${w.title}`,
    body: `<p>${escape(String(ctx.actionMessage ?? "Our team needs some information from you to keep your order moving."))}</p>`,
    ctaLabel: "Take action",
  }),
  approval_needed_customer: (w, ctx) => ({
    title: `New location to review — ${w.title}`,
    body: `<p>A location has been found and is ready for your review.</p>${
      ctx.businessName
        ? `<p style="margin-top:8px"><strong>${escape(String(ctx.businessName))}</strong>${
            ctx.city || ctx.state ? ` — ${escape([ctx.city, ctx.state].filter(Boolean).join(", "))}` : ""
          }</p>`
        : ""
    }<p style="margin-top:8px">Open your order to accept or decline. Please review promptly.</p>`,
    ctaLabel: "Review location",
  }),
  deadline_changed_customer: (w) => ({
    title: `Deadline updated for ${w.title}`,
    body: `<p>The estimated completion date for your <strong>${escape(w.title)}</strong> has been updated. Log in to see the new date and progress.</p>`,
    ctaLabel: "View details",
  }),

  // Employee-facing
  assignment_created_employee: (w) => ({
    title: `You've been assigned: ${w.workflow_number} — ${w.title}`,
    body: `<p>You are now the primary owner of <strong>${escape(w.title)}</strong>. Open the workflow to review the current state and next steps.</p>`,
    ctaLabel: "Open workflow",
  }),
  due_soon_employee: (w) => ({
    title: `Due soon: ${w.workflow_number} — ${w.title}`,
    body: `<p>This workflow is approaching its deadline${w.due_date ? ` on <strong>${new Date(w.due_date).toLocaleDateString()}</strong>` : ""}. Please review status and update progress.</p>`,
    ctaLabel: "Open workflow",
  }),
  overdue_employee: (w) => ({
    title: `Overdue: ${w.workflow_number} — ${w.title}`,
    body: `<p>This workflow has passed its deadline${w.due_date ? ` (${new Date(w.due_date).toLocaleDateString()})` : ""} and remains open. Escalation recommended.</p>`,
    ctaLabel: "Open workflow",
  }),
};
