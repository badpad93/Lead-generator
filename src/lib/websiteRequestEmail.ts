import { Resend } from "resend";
import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Website Request notifications — piggybacks on Resend + the same FROM
 * address the rest of the app uses. Idempotent per (request_id, event)
 * so status transitions don't double-fire on retries.
 */

const FROM = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
const ADMIN_INBOX = process.env.WEBSITE_ADMIN_EMAIL
  || process.env.COFFEE_ADMIN_EMAIL
  || "james@apexaivending.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";

type NotificationEvent =
  | "submitted"
  | "needs_information"
  | "approved_for_build"
  | "in_development"
  | "client_review"
  | "ready_to_launch"
  | "launched";

interface RequestSlim {
  id: string;
  business_name?: string | null;
  primary_contact?: string | null;
  email?: string | null;
}

function h(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));
}

/**
 * Idempotency check — look at website_request_activity to see whether
 * we've already logged this same event/status pair. Prevents Resend
 * duplicates on webhook / retry storms.
 */
async function alreadySent(requestId: string, event: NotificationEvent): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("website_request_activity")
    .select("id")
    .eq("request_id", requestId)
    .eq("event_type", `notified_${event}`)
    .limit(1);
  return (data || []).length > 0;
}

async function markSent(requestId: string, event: NotificationEvent, meta?: Record<string, unknown>) {
  await supabaseAdmin.from("website_request_activity").insert({
    request_id: requestId,
    event_type: `notified_${event}`,
    visibility: "internal",
    metadata: meta || null,
  });
}

/**
 * Copy library — one per supported event. Keep marketing tone friendly
 * and match the spec verbatim where the user gave copy.
 */
function copyFor(event: NotificationEvent, req: RequestSlim): {
  customerSubject: string;
  customerHtml: string;
  adminSubject: string;
  adminHtml: string;
} {
  const businessName = req.business_name || "your business";
  const contactName = req.primary_contact || "there";
  const link = `${APP_URL}/website-builder/${req.id}`;
  const adminLink = `${APP_URL}/admin/website-requests/${req.id}`;

  switch (event) {
    case "submitted":
      return {
        customerSubject: "We Received Your Website Request",
        customerHtml: shell(`
          <p>Hi ${h(contactName)},</p>
          <p>Thanks for submitting your vending website information. Our team has received your
          request and will review your business information, branding, content, and requested
          features. We&rsquo;ll contact you if anything else is needed.</p>
          <p><a href="${h(link)}" style="color:#16a34a;">View your request</a></p>
        `),
        adminSubject: `New website request — ${businessName}`,
        adminHtml: shell(`
          <p><strong>${h(businessName)}</strong> submitted a new website request.</p>
          <p>Primary contact: ${h(contactName)} &lt;${h(req.email || "")}&gt;</p>
          <p><a href="${h(adminLink)}" style="color:#16a34a;">Open in admin</a></p>
        `),
      };
    case "needs_information":
      return {
        customerSubject: "Action needed on your website request",
        customerHtml: shell(`
          <p>Hi ${h(contactName)},</p>
          <p>We need a little more information to keep building your vending website.
          Open your request to see what&rsquo;s outstanding and reply.</p>
          <p><a href="${h(link)}" style="color:#16a34a;">Open your request</a></p>
        `),
        adminSubject: `Needs-info sent — ${businessName}`,
        adminHtml: shell(`<p>Sent a needs-info request to ${h(contactName)} for <strong>${h(businessName)}</strong>.</p>`),
      };
    case "approved_for_build":
      return {
        customerSubject: "Your website request is approved for build",
        customerHtml: shell(`
          <p>Hi ${h(contactName)},</p>
          <p>Good news — we&rsquo;ve approved <strong>${h(businessName)}</strong> for build. Our
          team is starting your site now. We&rsquo;ll reach out with a client review when the
          first draft is ready.</p>
        `),
        adminSubject: `Approved for build — ${businessName}`,
        adminHtml: shell(`<p>Marked <strong>${h(businessName)}</strong> approved for build.</p>`),
      };
    case "in_development":
      return {
        customerSubject: "Your website is in development",
        customerHtml: shell(`<p>Hi ${h(contactName)},</p><p>Your website is officially in development. We&rsquo;ll invite you to review a draft as soon as it&rsquo;s ready.</p>`),
        adminSubject: `In development — ${businessName}`,
        adminHtml: shell(`<p>${h(businessName)} moved to In Development.</p>`),
      };
    case "client_review":
      return {
        customerSubject: "Your website draft is ready to review",
        customerHtml: shell(`
          <p>Hi ${h(contactName)},</p>
          <p>Your website draft for <strong>${h(businessName)}</strong> is ready for your review.
          Open your request for the preview link and next steps.</p>
          <p><a href="${h(link)}" style="color:#16a34a;">Open your request</a></p>
        `),
        adminSubject: `Client review sent — ${businessName}`,
        adminHtml: shell(`<p>Sent client review link to ${h(contactName)} for <strong>${h(businessName)}</strong>.</p>`),
      };
    case "ready_to_launch":
      return {
        customerSubject: "Your website is ready to launch",
        customerHtml: shell(`<p>Hi ${h(contactName)},</p><p>Everything looks good on our side — your website is ready to launch. We&rsquo;ll confirm the go-live time with you.</p>`),
        adminSubject: `Ready to launch — ${businessName}`,
        adminHtml: shell(`<p>${h(businessName)} marked Ready to Launch.</p>`),
      };
    case "launched":
      return {
        customerSubject: "Your website is live",
        customerHtml: shell(`<p>Hi ${h(contactName)},</p><p>Your new vending website is live. Congrats! We&rsquo;ll follow up soon with performance tips.</p>`),
        adminSubject: `Launched — ${businessName}`,
        adminHtml: shell(`<p>${h(businessName)} launched.</p>`),
      };
  }
}

function shell(body: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
      <div style="margin-bottom:20px;"><strong style="color:#16a34a;font-size:20px;">Vending Connector</strong></div>
      ${body}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#9ca3af;font-size:11px;">Vending Connector · vendingconnector.com</p>
    </div>
  `;
}

export async function sendWebsiteRequestNotification(args: {
  event: NotificationEvent;
  request: RequestSlim;
  skipAdmin?: boolean;
  skipCustomer?: boolean;
}): Promise<void> {
  const { event, request } = args;
  if (await alreadySent(request.id, event)) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const copy = copyFor(event, request);

  const sends: Promise<unknown>[] = [];
  if (!args.skipCustomer && request.email) {
    sends.push(resend.emails.send({
      from: FROM,
      to: request.email,
      subject: copy.customerSubject,
      html: copy.customerHtml,
    }));
  }
  if (!args.skipAdmin) {
    sends.push(resend.emails.send({
      from: FROM,
      to: ADMIN_INBOX,
      subject: copy.adminSubject,
      html: copy.adminHtml,
    }));
  }
  try {
    await Promise.all(sends);
    await markSent(request.id, event);
  } catch (e) {
    // Don't mark sent on failure — retry on next status transition.
    console.error("[websiteRequestEmail] send failed:", e);
  }
}
