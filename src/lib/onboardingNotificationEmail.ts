import { Resend } from "resend";
import { supabaseAdmin } from "./supabaseAdmin";

const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@bytebitevending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

interface CompletedDoc {
  templateName: string;
  formFields: { key: string; label: string; type: string }[];
  formData: Record<string, unknown>;
}

interface NotificationParams {
  candidateId: string;
  candidateName: string;
  candidateRoleType: string;
  stepKey: string;
  completedDocs: CompletedDoc[];
}

function maskSensitive(value: string): string {
  if (!value || value.length <= 4) return "****";
  return "***" + value.slice(-4);
}

function renderFormDataHtml(docs: CompletedDoc[]): string {
  return docs
    .map((doc) => {
      const rows = doc.formFields
        .filter((f) => f.type !== "checkbox" || doc.formData[f.key])
        .map((f) => {
          let val = doc.formData[f.key];
          if (val === undefined || val === null || val === "") return "";
          if (f.type === "checkbox") {
            val = val ? "Yes" : "No";
          } else if (f.type === "sensitive") {
            val = maskSensitive(String(val));
          } else if (f.type === "signature") {
            val = `<em style="font-family:serif;">${String(val)}</em>`;
          } else {
            val = String(val);
          }
          return `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">${f.label}</td><td style="padding:6px 12px;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6;">${val}</td></tr>`;
        })
        .filter(Boolean)
        .join("");

      return `
        <div style="margin-bottom:20px;">
          <h3 style="margin:0 0 8px;font-size:15px;color:#111827;">${doc.templateName} — Completed</h3>
          <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;">
            ${rows}
          </table>
        </div>`;
    })
    .join("");
}

export async function sendCompletionNotification(params: NotificationParams): Promise<void> {
  const { candidateId, candidateName, candidateRoleType, stepKey, completedDocs } = params;

  const { data: candidate } = await supabaseAdmin
    .from("candidates")
    .select("assigned_to")
    .eq("id", candidateId)
    .single();

  const recipientIds = new Set<string>();

  if (candidate?.assigned_to) {
    recipientIds.add(candidate.assigned_to);
  }

  const { data: elevatedUsers } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role")
    .in("role", ["admin", "director_of_sales"]);

  for (const u of elevatedUsers || []) {
    recipientIds.add(u.id);
  }

  const { data: recipients } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", Array.from(recipientIds));

  const emails = (recipients || [])
    .map((r) => r.email)
    .filter((e): e is string => !!e);

  if (emails.length === 0) return;

  const docNames = completedDocs.map((d) => d.templateName).join(", ");
  const roleLabel = candidateRoleType === "BDP" ? "BDP Agreement" : "Market Leader Agreement";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://vendingconnector.com";
  const viewUrl = `${siteUrl}/sales/candidates/${candidateId}/forms`;

  const isInterviewStep = stepKey === "interview";

  const subject = `${candidateName} — ${isInterviewStep ? "Interview" : "Onboarding"} Documents Completed`;

  const bodyHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
      <h1 style="color:#111827;font-size:22px;margin:0 0 20px;">Documents Completed</h1>
      <p style="color:#374151;font-size:14px;line-height:1.6;">
        Hello,
      </p>
      <p style="color:#374151;font-size:14px;line-height:1.6;">
        Candidate <strong>${candidateName}</strong> has completed their <strong>${docNames}</strong>.
      </p>
      ${isInterviewStep ? `
      <p style="color:#374151;font-size:14px;line-height:1.6;">
        Please let them know they will need to check their email for the next step, which is signing the <strong>${roleLabel}</strong>.
      </p>
      ` : `
      <p style="color:#374151;font-size:14px;line-height:1.6;">
        All onboarding documents have been completed and submitted.
      </p>
      `}
      <div style="margin:24px 0;text-align:center;">
        <a href="${viewUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Completed Documents</a>
      </div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      ${renderFormDataHtml(completedDocs)}
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">Vending Connector — vendingconnector.com</p>
    </div>`;

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: emails,
      subject,
      html: bodyHtml,
    });
  } catch {
    // Notification failure shouldn't block the flow
  }
}
