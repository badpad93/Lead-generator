"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Download, FileText, Mail, CheckCircle2 } from "lucide-react";

const PDF_URL = "/financing/umsb-sba-application.pdf";
const CONTACT_EMAIL = "james@apexaivending.com";

function CompleteApplicationContent() {
  const params = useSearchParams();
  const ref = params.get("ref") || "";
  const subject = ref
    ? `Completed SBA Application — Ref ${ref}`
    : "Completed SBA Application";
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;

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
            Two steps: (1) fill out the United Midwest Savings Bank PDF below, (2) email it back to us. Our team packages your submission and forwards it to the lender.
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
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Email It Back</h3>
            <p className="text-xs text-gray-500">Send the completed PDF to <span className="font-medium text-gray-700">{CONTACT_EMAIL}</span>. We&apos;ll confirm receipt and take it from there.</p>
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
              <a
                href={mailto}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                Email Completed PDF
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
