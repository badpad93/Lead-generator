import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — SBA app is ~500 KB scanned, generous headroom
const BUCKET = "financing-completed-applications";
const NOTIFY_EMAIL = process.env.FINANCING_NOTIFY_EMAIL || "james@apexaivending.com";
const FROM_EMAIL = process.env.FINANCING_FROM_EMAIL || "receipts@bytebitevending.com";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not configured");
    _resend = new Resend(key);
  }
  return _resend;
}

/**
 * POST /api/financing/{applicationId}/upload-completed
 *
 * Public endpoint — pre-qualified applicants land here from the
 * completion page and upload their filled UMSB SBA PDF. Auth by
 * knowledge of the application id (a UUID delivered by email + shown
 * in the CRM after pre-qualification). No user session required so
 * guest applicants can still complete the loop.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await params;
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  const { data: application, error: fetchErr } = await supabaseAdmin
    .from("financing_applications")
    .select("id, full_name, email")
    .eq("id", applicationId)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 15 MB" }, { status: 413 });
  }
  const mime = file.type || "application/pdf";
  if (mime !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF uploads are accepted" }, { status: 415 });
  }

  const safeName = (file.name || "sba-application.pdf")
    .replace(/[^\w.\-]/g, "_")
    .slice(-120);
  const storagePath = `${applicationId}/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const uploadedAt = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from("financing_applications")
    .update({
      completed_pdf_storage_path: storagePath,
      completed_pdf_uploaded_at: uploadedAt,
      completed_pdf_original_name: file.name || "sba-application.pdf",
      completed_pdf_size_bytes: file.size,
    })
    .eq("id", applicationId);
  if (updateErr) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Signed URL so james@apexaivending.com can click straight through
  // to the uploaded PDF from the notification email. 30 days — long
  // enough to get through underwriting review without needing a fresh
  // link if it sits in the inbox.
  let signedUrl: string | null = null;
  try {
    const { data: signed } = await supabaseAdmin
      .storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 30);
    signedUrl = signed?.signedUrl ?? null;
  } catch (signErr) {
    console.error("[financing/upload] failed to sign URL:", signErr);
  }

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: `Completed SBA Application — ${application.full_name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
          <h2 style="color:#16a34a;margin:0 0 12px;">Completed SBA Application Received</h2>
          <p><strong>${application.full_name}</strong> (${application.email}) just uploaded their completed United Midwest Savings Bank SBA financing application.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px">
            <tr><td style="padding:6px 12px;font-weight:bold;width:40%">Application ID</td><td style="padding:6px 12px">${applicationId}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:6px 12px;font-weight:bold">File</td><td style="padding:6px 12px">${file.name || "sba-application.pdf"} (${Math.round(file.size / 1024)} KB)</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Uploaded</td><td style="padding:6px 12px">${new Date(uploadedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET</td></tr>
          </table>
          ${signedUrl ? `<p style="text-align:center;margin:24px 0"><a href="${signedUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 24px;border-radius:8px;font-weight:600;text-decoration:none">Open Completed PDF →</a></p>` : `<p style="color:#c2410c;font-size:12px">Note: signed download URL could not be generated — retrieve from Supabase storage bucket <code>${BUCKET}</code> at path <code>${storagePath}</code>.</p>`}
          <p style="color:#666;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
            Storage path: <code>${storagePath}</code><br>
            Bucket: <code>${BUCKET}</code>
          </p>
        </div>
      `,
    });
  } catch (emailErr) {
    console.error("[financing/upload] admin notification failed:", emailErr);
  }

  return NextResponse.json({
    success: true,
    applicationId,
    storagePath,
    uploadedAt,
  });
}
