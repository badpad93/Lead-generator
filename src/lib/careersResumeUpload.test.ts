import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Careers resume upload: the public (anonymous) applicant can't write to the
 * `documents` bucket (anon INSERT is denied by RLS), so the upload goes
 * through a service-role server route that re-validates the file. Résumés are
 * applicant PII, so they land in the PRIVATE `career-resumes` bucket and the
 * admin UI opens them via short-lived signed URLs. Asserted at the source
 * level (these modules import the Supabase env).
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("server upload route", () => {
  const src = read("src/app/api/careers/upload-resume/route.ts");
  it("writes with the service role (bypasses RLS), not the anon client", () => {
    expect(src).toContain("supabaseAdmin.storage");
    expect(src).toContain(".from(BUCKET)");
  });
  it("targets the private career-resumes bucket, not the public documents one", () => {
    expect(src).toContain('BUCKET = "career-resumes"');
    expect(src).not.toContain('BUCKET = "documents"');
  });
  it("returns the object key, never a public URL", () => {
    expect(src).toContain("NextResponse.json({ path })");
    expect(src).not.toContain("getPublicUrl");
  });
  it("re-validates MIME (PDF/Word) and the 10MB cap server-side", () => {
    expect(src).toContain("application/pdf");
    expect(src).toContain("application/msword");
    expect(src).toContain("vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(src).toContain("MAX_BYTES = 10 * 1024 * 1024");
    expect(src).toContain("status: 415");
    expect(src).toContain("status: 413");
  });
});

describe("private bucket + signed URLs", () => {
  it("declares the career-resumes bucket private in a migration", () => {
    const sql = read("supabase/migrations/20260918000000_career_resumes_private_bucket.sql");
    expect(sql).toContain("'career-resumes'");
    expect(sql).toContain("false"); // public = false
  });
  it("signs stored keys but passes legacy absolute URLs through unchanged", () => {
    const src = read("src/lib/careersResumeStorage.ts");
    expect(src).toContain("createSignedUrl");
    expect(src).toContain("^https?:"); // legacy public URL detection
  });
  it("resolves résumé URLs in the admin listing route", () => {
    const src = read("src/app/api/admin/careers/route.ts");
    expect(src).toContain("withSignedResumeUrls");
  });
  it("resolves the résumé URL when a status changes", () => {
    const src = read("src/app/api/admin/careers/applications/route.ts");
    expect(src).toContain("resolveResumeUrl");
  });
});

describe("careers page no longer uploads directly to Storage as anon", () => {
  const src = read("src/app/careers/page.tsx");
  it("posts the file to the server route", () => {
    expect(src).toContain('fetch("/api/careers/upload-resume", { method: "POST"');
  });
  it("consumes the returned object key", () => {
    expect(src).toContain("setResumeUrl(data.path)");
  });
  it("does not call the RLS-blocked anon storage upload", () => {
    expect(src).not.toContain('.from("documents").upload');
    expect(src).not.toContain("createBrowserClient");
  });
});
