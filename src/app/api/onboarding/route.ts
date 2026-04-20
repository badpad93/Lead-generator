import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateSignedUrls,
  sendOnboardingConfirmationEmail,
  sendOnboardingAdminNotification,
} from "@/lib/onboardingEmail";

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const name = formData.get("name") as string | null;
  const email = formData.get("email") as string | null;
  const w9File = formData.get("w9") as File | null;
  const idFile = formData.get("id") as File | null;

  if (!name || !email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }
  if (!w9File || !idFile) {
    return NextResponse.json({ error: "W9 and ID files are required" }, { status: 400 });
  }

  const timestamp = Date.now();
  const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const w9Path = `${sanitizedName}/${timestamp}_w9_${w9File.name}`;
  const idPath = `${sanitizedName}/${timestamp}_id_${idFile.name}`;

  // Upload W9
  const { error: w9Error } = await supabaseAdmin.storage
    .from("rep-docs")
    .upload(w9Path, w9File, {
      contentType: w9File.type,
      upsert: false,
    });

  if (w9Error) {
    return NextResponse.json(
      { error: `W9 upload failed: ${w9Error.message}` },
      { status: 500 }
    );
  }

  // Upload ID
  const { error: idError } = await supabaseAdmin.storage
    .from("rep-docs")
    .upload(idPath, idFile, {
      contentType: idFile.type,
      upsert: false,
    });

  if (idError) {
    return NextResponse.json(
      { error: `ID upload failed: ${idError.message}` },
      { status: 500 }
    );
  }

  // Generate signed URLs
  const signedFiles = await generateSignedUrls([
    { label: "W9", path: w9Path },
    { label: "ID", path: idPath },
  ]);

  // Send emails (non-blocking — don't fail submission if email fails)
  const emailParams = { repName: name, repEmail: email, files: signedFiles };

  let confirmationSent = false;
  let adminNotificationSent = false;

  try {
    const result = await sendOnboardingConfirmationEmail(emailParams);
    confirmationSent = !result?.error;
    if (result?.error) {
      console.error("Onboarding confirmation email error:", result.error);
    }
  } catch (e) {
    console.error("Onboarding confirmation email failed:", e);
  }

  try {
    const result = await sendOnboardingAdminNotification(emailParams);
    adminNotificationSent = result === null ? false : !result?.error;
    if (result?.error) {
      console.error("Onboarding admin notification error:", result.error);
    }
  } catch (e) {
    console.error("Onboarding admin notification failed:", e);
  }

  return NextResponse.json({
    ok: true,
    files: signedFiles.map((f) => ({ label: f.label, url: f.url })),
    emails: {
      confirmation_sent: confirmationSent,
      admin_notification_sent: adminNotificationSent,
    },
  });
}
