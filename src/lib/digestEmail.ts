import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@bytebitevending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface DigestLead {
  id: string;
  title: string;
  city: string;
  state: string;
  location_type: string | null;
  machine_types_wanted: string[] | null;
  price: number | null;
  urgency: string | null;
  estimated_daily_traffic: number | null;
}

interface OperatorDigestParams {
  to: string;
  operatorName: string;
  leads: DigestLead[];
  unsubscribeUrl: string;
}

function formatUrgency(u: string | null): string {
  if (!u) return "";
  const map: Record<string, string> = {
    asap: "ASAP",
    within_2_weeks: "Within 2 Weeks",
    within_1_month: "Within 1 Month",
    flexible: "Flexible",
  };
  return map[u] || u;
}

function buildLeadCard(lead: DigestLead, appUrl: string): string {
  const machineTypes = lead.machine_types_wanted?.join(", ") || "Various";
  const leadUrl = `${appUrl}/browse-requests`;

  return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
      <h3 style="margin:0 0 8px;font-size:16px;color:#111827;">${esc(lead.title)}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:4px 8px 4px 0;color:#6b7280;width:40%;">Location</td>
          <td style="padding:4px 0;color:#111827;font-weight:500;">${esc(lead.city)}, ${esc(lead.state)}</td>
        </tr>
        ${lead.location_type ? `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;">Type</td><td style="padding:4px 0;color:#111827;">${esc(lead.location_type)}</td></tr>` : ""}
        <tr>
          <td style="padding:4px 8px 4px 0;color:#6b7280;">Machine Types</td>
          <td style="padding:4px 0;color:#111827;">${esc(machineTypes)}</td>
        </tr>
        ${lead.estimated_daily_traffic ? `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;">Daily Traffic</td><td style="padding:4px 0;color:#111827;">${lead.estimated_daily_traffic}+</td></tr>` : ""}
        ${lead.urgency && lead.urgency !== "flexible" ? `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;">Urgency</td><td style="padding:4px 0;color:#dc2626;font-weight:600;">${formatUrgency(lead.urgency)}</td></tr>` : ""}
      </table>
      <div style="margin-top:12px;">
        <a href="${leadUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">View Locations</a>
      </div>
    </div>
  `;
}

export async function sendOperatorDigestEmail(params: OperatorDigestParams) {
  const { to, operatorName, leads, unsubscribeUrl } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";

  const leadCards = leads.map((l) => buildLeadCard(l, appUrl)).join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
      <div style="text-align:center;margin-bottom:32px;">
        <h1 style="color:#16a34a;font-size:24px;margin:0;">Vending Connector</h1>
        <p style="color:#6b7280;font-size:14px;margin:4px 0 0;">Location Digest</p>
      </div>

      <div style="background:#f0fdf4;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
        <h2 style="margin:0 0 8px;font-size:18px;color:#166534;">Hi ${esc(operatorName)}!</h2>
        <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">
          We found <strong>${leads.length} new location${leads.length === 1 ? "" : "s"}</strong> in your area that ${leads.length === 1 ? "needs" : "need"} a vending operator. Check ${leads.length === 1 ? "it" : "them"} out below:
        </p>
      </div>

      ${leadCards}

      <div style="text-align:center;margin-top:24px;">
        <a href="${appUrl}/browse-requests" style="display:inline-block;background:#111827;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">Browse All Locations</a>
      </div>

      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="font-size:12px;color:#9ca3af;margin:0;">
          You're receiving this because you're a registered operator on Vending Connector.
          <br><a href="${esc(unsubscribeUrl)}" style="color:#6b7280;">Unsubscribe from digest emails</a>
        </p>
      </div>
    </div>
  `;

  return getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${leads.length} new vending location${leads.length === 1 ? "" : "s"} near you — Vending Connector`,
    html,
  });
}
