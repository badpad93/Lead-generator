import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

interface InviteEmailArgs {
  to: string;
  inviterName: string;
  companyName: string;
  role: "manager" | "agent";
  token: string;
}

export async function sendTeamInviteEmail({
  to,
  inviterName,
  companyName,
  role,
  token,
}: InviteEmailArgs): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  const acceptUrl = `${SITE_URL}/placement/team/invite/${token}`;
  const roleLabel = role === "manager" ? "Manager" : "Agent";

  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${inviterName} invited you to join ${companyName} on Vending Connector`,
    html: `
<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:40px 24px;color:#111827;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="color:#16a34a;font-size:24px;margin:0;">Vending Connector</h1>
    <p style="color:#6b7280;font-size:14px;margin:8px 0 0;">Placement Partner Team Invitation</p>
  </div>

  <p style="font-size:14px;color:#374151;">Hi there,</p>

  <p style="font-size:14px;color:#374151;line-height:1.6;">
    <strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> as a
    <strong>${roleLabel}</strong> on the Vending Connector placement partner marketplace.
  </p>

  <p style="font-size:14px;color:#374151;line-height:1.6;">
    As a ${roleLabel.toLowerCase()}, you'll be able to browse contracts, submit locations, and earn placement fees on behalf of ${companyName}.
  </p>

  <div style="text-align:center;margin:32px 0;">
    <a href="${acceptUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:16px;">Accept Invitation</a>
  </div>

  <p style="font-size:13px;color:#6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
  <p style="font-size:12px;color:#9ca3af;word-break:break-all;">${acceptUrl}</p>

  <p style="font-size:12px;color:#9ca3af;margin-top:32px;">
    If you didn't expect this invite, you can safely ignore this email — it expires in 14 days.
  </p>
</div>`,
  });
}
