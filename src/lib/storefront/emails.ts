/**
 * Storefront transactional emails.
 *
 * Every email that involves a storefront tenant is DUAL-BRANDED:
 * the header shows the tenant's colors + logo, and the footer
 * always says "Fulfilled by Vending Connector" so the customer
 * understands who ships / who bills. The receipt page never
 * shows base price or commission — only the tenant_price and
 * grand total.
 *
 * All senders are best-effort: failures log but don't throw out
 * so the calling business action isn't rolled back on an email
 * hiccup. The webhook + admin flows already write audit rows,
 * so the operator can retry from the admin console.
 */
import { Resend } from "resend";
import type { StorefrontTenant } from "@/lib/storefront/tenants";
import { trackingEmailBlockHtml } from "@/lib/orderTracking";

const FROM_EMAIL = process.env.STOREFRONT_FROM_EMAIL || process.env.FROM_EMAIL || "receipts@bytebitevending.com";

/**
 * The domain we're already verified to send from — derived from the
 * configured sender so we never hardcode or send from an unverified
 * domain. Tenant senders use a per-storefront local-part UNDER this same
 * verified domain (Resend authorizes the domain, not each address), so no
 * new domain verification is required. Per-operator custom sending domains
 * are a separate onboarding/verification workflow (not done here).
 */
const SENDING_DOMAIN = (() => {
  const at = FROM_EMAIL.lastIndexOf("@");
  return at >= 0 ? FROM_EMAIL.slice(at + 1) : "vendingconnector.com";
})();

/** Optional VC support fallback for Reply-To when the tenant has none. */
const SUPPORT_REPLY_TO = process.env.SUPPORT_EMAIL || process.env.REPLY_TO_EMAIL || undefined;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

/**
 * Deterministic, ASCII-safe email local-part for a storefront. Prefers the
 * slug (already unique + URL-safe); falls back to the sanitized display
 * name, then "coffee". Never empty.
 */
export function senderLocalPart(tenant: { slug?: string | null; display_name: string }): string {
  const raw = tenant.slug || tenant.display_name || "coffee";
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 64);
  return cleaned || "coffee";
}

/**
 * White-label sender for a tenant customer email. The customer perceives
 * the OPERATOR: display name "{Storefront} Coffee Services" and a
 * per-storefront address under our verified domain. Reply-To routes to the
 * operator's real support inbox when configured. Branding only — never
 * changes who is authorized/billed.
 */
export function tenantSender(
  tenant: { slug?: string | null; display_name: string; support_email?: string | null },
): { from: string; replyTo?: string } {
  const from = `${tenant.display_name} Coffee Services <${senderLocalPart(tenant)}@${SENDING_DOMAIN}>`;
  const replyTo = tenant.support_email || SUPPORT_REPLY_TO;
  return replyTo ? { from, replyTo } : { from };
}

function money(n: number): string {
  return `$${Number(n).toFixed(2)}`;
}

/**
 * Reusable dual-branded header + footer wrapper.
 * `tenant` carries brand.logo_url + brand.primary_color etc.
 */
function shell(opts: {
  tenant: Pick<StorefrontTenant, "display_name" | "legal_name" | "brand" | "support_email">;
  preheader?: string;
  body: string;
}): string {
  const brand = opts.tenant.brand ?? {};
  const primary = (brand.primary_color as string) || "#1a1a1a";
  const accent = (brand.accent_color as string) || "#c4a877";
  const text = (brand.text_color as string) || "#f4f0e8";
  const logo = brand.logo_url as string | undefined;
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(opts.tenant.display_name)}</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f6f4ef;color:#111">
<div style="display:none;font-size:1px;opacity:0;">${escapeHtml(opts.preheader ?? "")}</div>
<div style="max-width:600px;margin:0 auto;padding:0 0 24px 0;">
  <div style="background:${primary};color:${text};padding:24px 20px;">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logo ? `<img src="${escapeHtml(logo)}" alt="" style="height:32px;width:auto;" />` : ""}
      <div style="font-size:18px;font-weight:600;color:${accent};">${escapeHtml(opts.tenant.display_name)}</div>
    </div>
  </div>
  <div style="background:white;padding:24px 20px;border:1px solid #eee;border-top:none;">
    ${opts.body}
  </div>
  <div style="padding:16px 20px;font-size:12px;color:#666;">
    Fulfilled by Vending Connector on behalf of ${escapeHtml(opts.tenant.legal_name)}.
    ${opts.tenant.support_email ? `Questions? <a href="mailto:${opts.tenant.support_email}">${escapeHtml(opts.tenant.support_email)}</a>` : ""}
  </div>
</div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}

// ─── Invitation ────────────────────────────────────────────────────

export async function sendInvitationEmail(params: {
  tenant: Pick<StorefrontTenant, "slug" | "display_name" | "legal_name" | "brand" | "support_email">;
  to: string;
  displayName?: string | null;
  inviteUrl: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const body = `
    <h1 style="margin:0 0 12px 0;font-size:22px;">You've been invited to order coffee</h1>
    <p style="margin:0 0 12px 0;color:#333;">${params.displayName ? escapeHtml(params.displayName) + "," : "Hello,"} ${escapeHtml(params.tenant.display_name)} would like to enroll your account so you can order coffee, cups, and vending supplies directly.</p>
    <p style="margin:0 0 20px 0;color:#333;">Click below to accept — it takes about 30 seconds. Once you accept, your account is permanently linked to ${escapeHtml(params.tenant.display_name)} and can only be transferred by a Vending Connector administrator.</p>
    <p style="margin:0 0 24px 0;"><a href="${escapeHtml(params.inviteUrl)}" style="background:#111;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Accept invitation</a></p>
    <p style="margin:0;font-size:12px;color:#666;">Or paste this link into your browser:<br/>${escapeHtml(params.inviteUrl)}</p>
  `;
  try {
    await resend.emails.send({
      ...tenantSender(params.tenant),
      to: params.to,
      subject: `You've been invited to order coffee from ${params.tenant.display_name}`,
      html: shell({
        tenant: params.tenant,
        preheader: `${params.tenant.display_name} invited you to enroll`,
        body,
      }),
    });
  } catch (err) {
    console.error("[storefront/emails] invitation failed", err);
  }
}

// ─── Enrollment welcome ────────────────────────────────────────────

export async function sendEnrollmentWelcomeEmail(params: {
  tenant: Pick<StorefrontTenant, "display_name" | "legal_name" | "brand" | "support_email" | "slug">;
  to: string;
  displayName?: string | null;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const storefrontUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/coffee/o/${params.tenant.slug}`;
  const body = `
    <h1 style="margin:0 0 12px 0;font-size:22px;">You're enrolled with ${escapeHtml(params.tenant.display_name)}</h1>
    <p style="margin:0 0 12px 0;color:#333;">${params.displayName ? "Hi " + escapeHtml(params.displayName) + "," : "Hello,"} thanks for enrolling. You can now order from your storefront any time.</p>
    <p style="margin:0 0 24px 0;"><a href="${escapeHtml(storefrontUrl)}" style="background:#111;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Visit your storefront</a></p>
    <p style="margin:0;font-size:12px;color:#666;">Vending Connector ships every order and processes payment on behalf of ${escapeHtml(params.tenant.display_name)}.</p>
  `;
  try {
    await resend.emails.send({
      ...tenantSender(params.tenant),
      to: params.to,
      subject: `Welcome to ${params.tenant.display_name}`,
      html: shell({ tenant: params.tenant, body }),
    });
  } catch (err) {
    console.error("[storefront/emails] welcome failed", err);
  }
}

// ─── Order receipt (dual-branded) ──────────────────────────────────

export async function sendStorefrontOrderReceipt(params: {
  tenant: Pick<StorefrontTenant, "display_name" | "legal_name" | "brand" | "support_email">;
  to: string;
  orderNumber: string;
  lines: Array<{ product_name: string; sku: string; quantity: number; unit_price: number; line_total: number }>;
  total: number;
  /** coffee_orders.tracking_number — support-call reference. */
  trackingNumber?: string | null;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const rows = params.lines
    .map(
      (l) => `
      <tr>
        <td style="padding:6px 0;">${escapeHtml(l.product_name)} <span style="color:#888;font-size:11px;">${escapeHtml(l.sku)}</span></td>
        <td style="padding:6px 0;text-align:right;">${l.quantity}</td>
        <td style="padding:6px 0;text-align:right;">${money(l.unit_price)}</td>
        <td style="padding:6px 0;text-align:right;">${money(l.line_total)}</td>
      </tr>`,
    )
    .join("");
  const body = `
    <h1 style="margin:0 0 12px 0;font-size:22px;">Order ${escapeHtml(params.orderNumber)}</h1>
    <p style="margin:0 0 12px 0;color:#333;">Thanks for your order.</p>
    ${params.trackingNumber ? trackingEmailBlockHtml(escapeHtml(params.trackingNumber)) : ""}
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead><tr style="text-align:left;color:#666;font-size:11px;text-transform:uppercase;">
        <th>Item</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Unit</th><th style="text-align:right;">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3" style="padding-top:12px;text-align:right;font-weight:600;">Total</td><td style="padding-top:12px;text-align:right;font-weight:600;">${money(params.total)}</td></tr></tfoot>
    </table>
  `;
  try {
    await resend.emails.send({
      ...tenantSender(params.tenant),
      to: params.to,
      subject: `Order ${params.orderNumber} — ${params.tenant.display_name}`,
      html: shell({
        tenant: params.tenant,
        preheader: `Order ${params.orderNumber} received`,
        body,
      }),
    });
  } catch (err) {
    console.error("[storefront/emails] receipt failed", err);
  }
}

// ─── Operator: commission payable / payout sent / tenant suspended ─

export async function sendOperatorCommissionPayable(params: {
  tenant: Pick<StorefrontTenant, "display_name" | "legal_name" | "brand" | "support_email">;
  to: string;
  amount: number;
  orderNumber: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const body = `
    <h1 style="margin:0 0 12px 0;font-size:20px;">Commission payable</h1>
    <p style="margin:0 0 12px 0;color:#333;">Order ${escapeHtml(params.orderNumber)} settled. ${money(params.amount)} in commission is now payable and will be included in your next payout batch.</p>
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: `Commission payable — ${money(params.amount)}`,
      html: shell({ tenant: params.tenant, body }),
    });
  } catch (err) {
    console.error("[storefront/emails] payable failed", err);
  }
}

export async function sendOperatorPayoutSent(params: {
  tenant: Pick<StorefrontTenant, "display_name" | "legal_name" | "brand" | "support_email">;
  to: string;
  amount: number;
  rowCount: number;
  qbBillPaymentId: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const body = `
    <h1 style="margin:0 0 12px 0;font-size:20px;">Payout sent</h1>
    <p style="margin:0 0 12px 0;color:#333;">${money(params.amount)} was paid via QuickBooks (${params.rowCount} commission lines cleared). Payment reference: ${escapeHtml(params.qbBillPaymentId)}.</p>
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: `Payout sent — ${money(params.amount)}`,
      html: shell({ tenant: params.tenant, body }),
    });
  } catch (err) {
    console.error("[storefront/emails] payout failed", err);
  }
}

export async function sendTenantSuspendedNotice(params: {
  tenant: Pick<StorefrontTenant, "display_name" | "legal_name" | "brand" | "support_email">;
  to: string;
  reason: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const body = `
    <h1 style="margin:0 0 12px 0;font-size:20px;">Your storefront has been suspended</h1>
    <p style="margin:0 0 12px 0;color:#333;">${escapeHtml(params.tenant.display_name)} has been temporarily suspended.</p>
    <p style="margin:0 0 12px 0;color:#333;"><strong>Reason:</strong> ${escapeHtml(params.reason)}</p>
    <p style="margin:0;font-size:12px;color:#666;">Contact Vending Connector to resolve.</p>
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: `Storefront suspended — ${params.tenant.display_name}`,
      html: shell({ tenant: params.tenant, body }),
    });
  } catch (err) {
    console.error("[storefront/emails] suspended failed", err);
  }
}
