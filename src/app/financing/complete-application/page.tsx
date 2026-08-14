"use client";

import Link from "next/link";
import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileText,
  Mail,
  CheckCircle2,
  Upload,
  Loader2,
  AlertCircle,
} from "lucide-react";

const PDF_URL = "/financing/umsb-sba-application.pdf";
const CONTACT_EMAIL = "james@apexaivending.com";
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function CompleteApplicationContent() {
  const params = useSearchParams();
  const ref = params.get("ref") || "";
  const subject = ref
    ? `Completed SBA Application — Ref ${ref}`
    : "Completed SBA Application";
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function onFilePicked(file: File | null) {
    setUploadError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (file.type && file.type !== "application/pdf") {
      setUploadError("Please choose a PDF file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("File exceeds 15 MB.");
      return;
    }
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) return;
    if (!ref) {
      setUploadError(
        "Missing application reference. Please use the link from your pre-qualification email, or email the PDF to " +
          CONTACT_EMAIL +
          " instead.",
      );
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      const res = await fetch(
        `/api/financing/${encodeURIComponent(ref)}/upload-completed`,
        { method: "POST", body: fd },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(data.error || "Upload failed. Please try again or email the PDF.");
      } else {
        setUploaded(true);
      }
    } catch {
      setUploadError("Network error. Please try again or email the PDF.");
    }
    setUploading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/financing"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-600 transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Financing Options
        </Link>

        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 mb-3">
            <CheckCircle2 className="h-3.5 w-3.5" />
            You&apos;re Pre-Qualified
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Complete Your SBA Financing Application
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Two steps: (1) download and fill out the United Midwest Savings Bank PDF below, (2) upload it right back here — or email it if you prefer. Our team packages your submission and forwards it to the lender.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-green-700 text-sm font-bold">1</div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Download the PDF</h3>
            <p className="text-xs text-gray-500">Use the button below. The form is fillable in your browser, Adobe Reader, or macOS Preview.</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-green-700 text-sm font-bold">2</div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Fill It Out</h3>
            <p className="text-xs text-gray-500">Complete every field, sign, and save. No printing required if your PDF app supports fillable forms.</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-green-700 text-sm font-bold">3</div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Upload It Back</h3>
            <p className="text-xs text-gray-500">Send it right back through the uploader below — our team gets notified the moment it lands.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-6">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-green-600" />
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  United Midwest Savings Bank — SBA Financing Application
                </h2>
                <p className="text-[11px] text-gray-400">PDF preview — download to fill and sign</p>
              </div>
            </div>
            <div className="flex gap-2">
              <a
                href={PDF_URL}
                download="UMSB-SBA-Financing-Application.pdf"
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download PDF
              </a>
            </div>
          </div>
          <div className="bg-gray-100">
            <iframe
              src={`${PDF_URL}#toolbar=1&view=FitH`}
              title="UMSB SBA Financing Application"
              className="w-full border-0"
              style={{ height: "820px" }}
            />
          </div>
        </div>

        {/* Return path — upload or email */}
        <div className="rounded-2xl border border-green-200 bg-green-50 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-green-200">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-green-700" />
              <div>
                <h2 className="text-sm font-semibold text-green-900">Return your completed PDF</h2>
                <p className="text-[11px] text-green-700">Upload here for fastest turnaround, or email if that&apos;s easier.</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            {uploaded ? (
              <div className="flex items-start gap-3 rounded-lg bg-white border border-green-200 px-4 py-4">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Application received</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Thanks — our team has been notified and will review your submission within 3–5 business days.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-white border border-green-200 p-4 mb-3">
                  <label
                    htmlFor="completed-pdf"
                    className="block cursor-pointer border-2 border-dashed border-green-300 rounded-lg px-4 py-6 text-center hover:border-green-500 transition-colors"
                  >
                    <Upload className="mx-auto h-6 w-6 text-green-600 mb-2" />
                    <p className="text-sm font-medium text-gray-900">
                      {selectedFile ? selectedFile.name : "Click to choose your completed PDF"}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      PDF only, max 15 MB
                      {selectedFile ? ` — ${Math.round(selectedFile.size / 1024)} KB` : ""}
                    </p>
                    <input
                      ref={fileInputRef}
                      id="completed-pdf"
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => onFilePicked(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  {uploadError && (
                    <div className="mt-3 flex items-start gap-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{uploadError}</span>
                    </div>
                  )}
                  <div className="mt-4 flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={handleUpload}
                      disabled={!selectedFile || uploading || !ref}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Submit Completed PDF
                        </>
                      )}
                    </button>
                    <a
                      href={mailto}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Mail className="h-4 w-4" />
                      Email Instead
                    </a>
                  </div>
                  {!ref && (
                    <p className="mt-3 text-[11px] text-amber-700">
                      Reference number missing — the uploader needs the link from your pre-qualification email. You can still email the PDF to {CONTACT_EMAIL}.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
          <strong>Reminder:</strong> pre-qualification is not final loan approval. Final approval is subject to lender review and full underwriting. Please respond within 14 days to keep your pre-qualification current.
        </div>

        {ref ? (
          <p className="text-[11px] text-gray-400 mt-4">Reference: {ref}</p>
        ) : null}
      </div>
    </div>
  );
}

export default function CompleteApplicationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading…</div>}>
      <CompleteApplicationContent />
    </Suspense>
  );
}
