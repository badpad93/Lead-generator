import { Resend } from "resend";
import { supabaseAdmin } from "./supabaseAdmin";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || "";
const SIGNED_URL_EXPIRY = 60 * 60 * 24; // 24 hours in seconds

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

interface SignedFile {
  label: string;
  path: string;
  url: string | null;
}

export async function generateSignedUrls(
  files: { label: string; path: string }[]
): Promise<SignedFile[]> {
  const results: SignedFile[] = [];

  for (const file of files) {
    const { data, error } = await supabaseAdmin.storage
      .from("rep-docs")
      .createSignedUrl(file.path, SIGNED_URL_EXPIRY);

    results.push({
      label: file.label,
      path: file.path,
      url: error ? null : data.signedUrl,
    });

    if (error) {
      console.error(`Failed to generate signed URL for ${file.path}:`, error.message);
    }
  }

  return results;
}

interface OnboardingEmailParams {
  repName: string;
  repEmail: string;
  files: SignedFile[];
}

export async function sendOnboardingConfirmationEmail(params: OnboardingEmailParams) {
  const { repName, repEmail, files } = params;

  const fileRows = files
    .map((f) =>
      f.url
        ? `<tr>
            <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#111827;">${f.label}</td>
            <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;">
              <a href="${f.url}" style="color:#111827;font-weight:600;text-decoration:underline;">View Document</a>
            </td>
          </tr>`
        : `<tr>
            <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#111827;">${f.label}</td>
            <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280;">Unavailable</td>
          </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111827;">
      <div style="text-align:center;margin-bottom:32px;">
        <h1 style="font-size:22px;margin:0;color:#111827;">Onboarding Submission Received</h1>
      </div>

      <div style="background:#f9fafb;border-radius:12px;padding:24px;margin-bottom:24px;">
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
          Hi ${repName},
        </p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
          We've received your onboarding documents. Below are secure links to view your uploaded files. These links expire in 24 hours.
        </p>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${fileRows}
        </table>
      </div>

      <p style="font-size:12px;color:#6b7280;text-align:center;margin:0;">
        If you did not submit these documents, please contact us immediately.
      </p>
    </div>
  `;

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: repEmail,
    subject: "Onboarding Submission Received",
    html,
  });
}

export async function sendOnboardingAdminNotification(params: OnboardingEmailParams) {
  if (!ADMIN_EMAIL) return null;

  const { repName, repEmail, files } = params;

  const fileRows = files
    .map((f) =>
      f.url
        ? `<tr>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">${f.label}</td>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">
              <a href="${f.url}" style="color:#111827;text-decoration:underline;">View</a>
            </td>
          </tr>`
        : `<tr>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">${f.label}</td>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280;">Upload failed</td>
          </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111827;">
      <div style="text-align:center;margin-bottom:32px;">
        <h1 style="font-size:22px;margin:0;color:#111827;">New Rep Onboarding Submission</h1>
      </div>

      <div style="background:#f9fafb;border-radius:12px;padding:24px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
          <tr>
            <td style="padding:8px 0;color:#6b7280;">Name</td>
            <td style="padding:8px 0;font-weight:600;">${repName}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;">Email</td>
            <td style="padding:8px 0;">${repEmail}</td>
          </tr>
        </table>

        <h3 style="margin:16px 0 8px;font-size:14px;color:#111827;">Documents</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${fileRows}
        </table>
      </div>
    </div>
  `;

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject: `New Onboarding: ${repName} (${repEmail})`,
    html,
  });
}
