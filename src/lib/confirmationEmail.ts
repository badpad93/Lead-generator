import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@bytebitevending.com";
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || "james@apexaivending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Field {
  label: string;
  value: string | number | boolean | null | undefined;
}

function buildFieldsTable(fields: Field[]): string {
  return fields
    .filter((f) => f.value !== undefined && f.value !== null && f.value !== "")
    .map((f, i) => {
      const val =
        typeof f.value === "boolean"
          ? f.value
            ? "Yes"
            : "No"
          : escapeHtml(String(f.value));
      const bg = i % 2 === 1 ? ' style="background:#f9fafb;"' : "";
      return `<tr${bg}><td style="padding:8px 12px;color:#6b7280;width:40%;font-size:14px;">${escapeHtml(f.label)}</td><td style="padding:8px 12px;color:#111827;font-size:14px;font-weight:500;">${val}</td></tr>`;
    })
    .join("");
}

function wrapEmail(title: string, intro: string, fieldsHtml: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
      <div style="text-align:center;margin-bottom:32px;">
        <h1 style="color:#16a34a;font-size:24px;margin:0;">VendHub</h1>
        <p style="color:#6b7280;font-size:14px;margin:4px 0 0;">${escapeHtml(title)}</p>
      </div>
      <div style="background:#f0fdf4;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
        <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">${intro}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        ${fieldsHtml}
      </table>
      <p style="font-size:13px;color:#6b7280;text-align:center;margin-top:24px;">
        Questions? Reply to this email or visit <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://vendhub.io"}" style="color:#16a34a;">VendHub</a>.
      </p>
    </div>
  `;
}

interface ConfirmationParams {
  formName: string;
  submitterEmail: string | null;
  submitterName: string | null;
  fields: Field[];
  adminSubject: string;
}

export async function sendFormConfirmationEmails(params: ConfirmationParams) {
  const { formName, submitterEmail, submitterName, fields, adminSubject } = params;
  const resend = getResend();
  const fieldsHtml = buildFieldsTable(fields);
  const promises: Promise<unknown>[] = [];

  if (submitterEmail) {
    const name = submitterName || "there";
    const submitterHtml = wrapEmail(
      `${formName} — Submission Received`,
      `Thank you${name !== "there" ? `, ${escapeHtml(name)}` : ""}! We've received your ${formName.toLowerCase()} submission. Our team will review it and follow up shortly.`,
      fieldsHtml
    );
    promises.push(
      resend.emails.send({
        from: FROM_EMAIL,
        to: submitterEmail,
        subject: `Your ${formName} submission has been received — VendHub`,
        html: submitterHtml,
      })
    );
  }

  const adminHtml = wrapEmail(
    `New ${formName} Submission`,
    `A new ${formName.toLowerCase()} has been submitted${submitterName ? ` by ${escapeHtml(submitterName)}` : ""}${submitterEmail ? ` (${escapeHtml(submitterEmail)})` : ""}.`,
    fieldsHtml
  );
  promises.push(
    resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: adminSubject,
      html: adminHtml,
    })
  );

  await Promise.allSettled(promises);
}
