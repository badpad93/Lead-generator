import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Careers resume upload: the public (anonymous) applicant can't write to the
 * `documents` bucket (anon INSERT is denied by RLS), so the upload goes
 * through a service-role server route that re-validates the file. Asserted at
 * the source level (the route imports the Supabase env).
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("server upload route", () => {
  const src = read("src/app/api/careers/upload-resume/route.ts");
  it("writes with the service role (bypasses RLS), not the anon client", () => {
    expect(src).toContain("supabaseAdmin.storage");
    expect(src).toContain('.from(BUCKET)');
    expect(src).toContain('BUCKET = "documents"');
  });
  it("re-validates MIME (PDF/Word) and the 10MB cap server-side", () => {
    expect(src).toContain("application/pdf");
    expect(src).toContain("application/msword");
    expect(src).toContain("vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(src).toContain("MAX_BYTES = 10 * 1024 * 1024");
    expect(src).toContain("status: 415");
    expect(src).toContain("status: 413");
  });
  it("keeps resumes under the career-resumes/ prefix", () => {
    expect(src).toContain("`career-resumes/");
  });
});

describe("careers page no longer uploads directly to Storage as anon", () => {
  const src = read("src/app/careers/page.tsx");
  it("posts the file to the server route", () => {
    expect(src).toContain('fetch("/api/careers/upload-resume", { method: "POST"');
  });
  it("does not call the RLS-blocked anon storage upload", () => {
    expect(src).not.toContain('.from("documents").upload');
    expect(src).not.toContain("createBrowserClient");
  });
});
