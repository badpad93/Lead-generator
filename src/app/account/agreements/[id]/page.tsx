"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Download,
  FileText,
  Calendar,
  Mail,
  Globe,
  UserPen,
  ShieldCheck,
  MapPin,
  ShoppingBag,
} from "lucide-react";
import type { SignedAgreement } from "@/lib/types";
import { apiRequest } from "@/lib/auth";

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AgreementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [agreement, setAgreement] = useState<SignedAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiRequest(`/api/agreements/${id}`);
        if (res.status === 404) {
          setError("Agreement not found");
          return;
        }
        if (res.status === 403) {
          setError("You do not have permission to view this agreement");
          return;
        }
        if (!res.ok) throw new Error("Failed to load agreement");
        const data = await res.json();
        setAgreement(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-160px)] bg-light">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          {/* Skeleton */}
          <div className="mb-6 h-4 w-40 rounded bg-gray-200 animate-pulse" />
          <div className="rounded-xl border border-gray-200 bg-white p-8">
            <div className="space-y-4">
              <div className="h-8 w-64 rounded bg-gray-200 animate-pulse" />
              <div className="h-4 w-48 rounded bg-gray-100 animate-pulse" />
              <div className="mt-8 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-4 rounded bg-gray-100 animate-pulse" style={{ width: `${80 - i * 8}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !agreement) {
    return (
      <div className="min-h-[calc(100vh-160px)] bg-light">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <Link
            href="/account/agreements"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Agreements
          </Link>
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
            <FileText className="mx-auto h-12 w-12 text-red-300 mb-4" />
            <p className="text-red-600 font-medium text-lg">
              {error || "Agreement not found"}
            </p>
            <Link
              href="/account/agreements"
              className="mt-4 inline-flex items-center gap-2 text-sm text-red-500 hover:text-red-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to agreements
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const lead = agreement.vending_requests;
  const purchase = agreement.lead_purchases;

  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {/* Back link */}
        <Link
          href="/account/agreements"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Agreements
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-xl font-bold text-black-primary">
                    Agreement Details
                  </h1>
                  <p className="text-sm text-gray-400 font-mono mt-1">
                    ID: {agreement.id}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                  v{agreement.agreement_version}
                </span>
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {formatDateTime(agreement.created_at)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-4 w-4" />
                  {agreement.signer_email}
                </span>
                {agreement.ip_address && (
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="h-4 w-4" />
                    {agreement.ip_address}
                  </span>
                )}
              </div>
            </div>

            {/* Agreement Text */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-black-primary mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-primary" />
                Agreement Text
              </h2>
              <div
                className="prose prose-sm prose-gray max-w-none [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm"
                dangerouslySetInnerHTML={{
                  __html: agreement.agreement_html,
                }}
              />
            </div>

            {/* Signature Block */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-black-primary mb-4 flex items-center gap-2">
                <UserPen className="h-5 w-5 text-green-primary" />
                Signature
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                    Signed Name
                  </p>
                  <p className="text-sm font-semibold text-black-primary italic text-lg">
                    {agreement.signed_name}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                    Email
                  </p>
                  <p className="text-sm text-black-primary">
                    {agreement.signer_email}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                    Timestamp
                  </p>
                  <p className="text-sm text-black-primary">
                    {formatDateTime(agreement.created_at)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                    IP Address
                  </p>
                  <p className="text-sm text-black-primary font-mono">
                    {agreement.ip_address || "Not recorded"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Download */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <a
                href={`/api/agreements/${agreement.id}/pdf`}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-primary px-4 py-3 text-sm font-semibold text-white hover:bg-green-hover transition-colors"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </a>
            </div>

            {/* Linked Lead */}
            {lead && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-black-primary mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-green-primary" />
                  Linked Lead
                </h3>
                <p className="text-sm font-medium text-black-primary mb-1">
                  {lead.title}
                </p>
                <p className="text-xs text-gray-400">
                  {lead.city}, {lead.state}
                </p>
                {lead.location_name && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {lead.location_name}
                  </p>
                )}
              </div>
            )}

            {/* Linked Purchase */}
            {purchase && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-black-primary mb-3 flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-green-primary" />
                  Linked Purchase
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-400">Purchase ID</span>
                    <span className="text-xs font-mono text-gray-600">
                      {purchase.id.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-400">Amount</span>
                    <span className="text-sm font-semibold text-green-primary">
                      {formatCurrency(purchase.amount_cents)}
                    </span>
                  </div>
                  {purchase.stripe_checkout_session_id && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-400">Stripe Ref</span>
                      <span className="text-xs font-mono text-gray-600 truncate max-w-[120px]">
                        {purchase.stripe_checkout_session_id.slice(-12)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Verification */}
            <div className="rounded-xl border border-green-100 bg-green-50/50 p-5">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                <h3 className="text-sm font-semibold text-green-800">
                  Verified Agreement
                </h3>
              </div>
              <p className="text-xs text-green-700 leading-relaxed">
                This agreement was electronically signed and is stored securely.
                The signature, timestamp, and IP address serve as a binding
                record of consent.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
