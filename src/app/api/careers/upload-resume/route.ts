import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/careers/upload-resume  (public — job applicants are anonymous)
 *
 * Body: multipart/form-data with `file` (the resume).
 *
 * The public careers page cannot upload to Storage directly: the `documents`
 * bucket only grants INSERT to `authenticated`, so an anonymous applicant's
 * browser upload is rejected by RLS ("new row violates row-level security
 * policy"). This route accepts the file server-side and writes it with the
 * service role (which bypasses RLS), after re-validating type and size — so
 * we never open anonymous write access to the shared bucket. Mirrors the
 * brand-asset upload pattern. Returns the public URL, which the apply route
 * stores on the application.
 */

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — matches the client cap
const BUCKET = "documents";

function extFor(mime: string, filename: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/msword") return "doc";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  const fromName = filename.split(".").pop()?.toLowerCase();
  return fromName && /^[a-z0-9]{1,8}$/.test(fromName) ? fromName : "bin";
}

/** Validate the uploaded resume; returns {status,error} to reject, or null to accept. */
function validateResume(file: File): { status: number; error: string } | null {
  if (!ALLOWED_MIME.has(file.type || "")) {
    return { status: 415, error: "Please upload a PDF or Word document" };
  }
  if (file.size > MAX_BYTES) {
    return { status: 413, error: "Resume must be under 10MB" };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const invalid = validateResume(file);
  if (invalid) {
    return NextResponse.json({ error: invalid.error }, { status: invalid.status });
  }

  const mime = file.type; // validated non-empty + allowlisted above
  const path = `career-resumes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFor(mime, file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { upsert: false, contentType: mime });
  if (uploadErr) {
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const url = data?.publicUrl ?? null;
  if (!url) {
    return NextResponse.json({ error: "Failed to resolve resume URL" }, { status: 500 });
  }
  return NextResponse.json({ url });
}
