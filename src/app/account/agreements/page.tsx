"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Download,
  Eye,
  Loader2,
  ArrowLeft,
  ChevronRight,
  ScrollText,
} from "lucide-react";
import type { SignedAgreement } from "@/lib/types";
import { apiRequest } from "@/lib/auth";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncateId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export default function AgreementsPage() {
  const [agreements, setAgreements] = useState<SignedAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiRequest("/api/agreements");
        if (!res.ok) throw new Error("Failed to load agreements");
        const data = await res.json();
        setAgreements(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <ScrollText className="h-7 w-7 text-green-primary" />
            <h1 className="text-2xl font-bold text-black-primary">
              My Agreements
            </h1>
          </div>
          <p className="text-gray-500 text-sm">
            View and download all agreements you have signed on VendingConnector.
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-green-primary" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-red-600 font-medium">{error}</p>
          </div>
        ) : agreements.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg font-medium">
              You have not signed any agreements yet.
            </p>
            <p className="text-gray-400 text-sm mt-2">
              Agreements will appear here after you purchase leads on the marketplace.
            </p>
            <Link
              href="/browse-requests"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-green-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-green-hover transition-colors"
            >
              Browse Requests
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Agreement ID
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Lead
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Purchase ID
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Version
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Date Signed
                    </th>
                    <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {agreements.map((agreement) => (
                    <tr
                      key={agreement.id}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-5 py-4">
                        <span className="font-mono text-sm text-black-primary font-medium">
                          {truncateId(agreement.id)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {agreement.vending_requests ? (
                          <div>
                            <p className="text-sm font-medium text-black-primary truncate max-w-[200px]">
                              {agreement.vending_requests.title}
                            </p>
                            <p className="text-xs text-gray-400">
                              {agreement.vending_requests.city},{" "}
                              {agreement.vending_requests.state}
                            </p>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {agreement.purchase_id ? (
                          <span className="font-mono text-sm text-gray-600">
                            {truncateId(agreement.purchase_id)}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          v{agreement.agreement_version}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600">
                        {formatDate(agreement.created_at)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/account/agreements/${agreement.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-black-primary transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Link>
                          <a
                            href={`/api/agreements/${agreement.id}/pdf`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                            PDF
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {agreements.map((agreement) => (
                <div
                  key={agreement.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-mono text-sm font-medium text-black-primary">
                        {truncateId(agreement.id)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDate(agreement.created_at)}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      v{agreement.agreement_version}
                    </span>
                  </div>

                  {agreement.vending_requests && (
                    <p className="text-sm text-gray-600 mb-1 truncate">
                      {agreement.vending_requests.title}
                    </p>
                  )}

                  {agreement.purchase_id && (
                    <p className="text-xs text-gray-400 mb-3">
                      Purchase: {truncateId(agreement.purchase_id)}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <Link
                      href={`/account/agreements/${agreement.id}`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </Link>
                    <a
                      href={`/api/agreements/${agreement.id}/pdf`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      PDF
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
