"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  MapPin,
  ShoppingBag,
  Clock,
  Search,
  Download,
  Phone,
  Mail,
  User,
  Building2,
  DollarSign,
} from "lucide-react";
import type { MachineType } from "@/lib/types";
import MachineTypeBadge from "@/app/components/MachineTypeBadge";

interface PurchasedLead {
  id: string;
  request_id: string;
  amount_cents: number;
  buyer_email: string | null;
  stripe_checkout_session_id: string | null;
  created_at: string;
  vending_requests: {
    id: string;
    title: string;
    location_name: string;
    address: string | null;
    city: string;
    state: string;
    zip: string | null;
    location_type: string;
    machine_types_wanted: MachineType[];
    estimated_daily_traffic: number | null;
    price: number | null;
    urgency: string;
    commission_offered: boolean;
    commission_notes: string | null;
    description: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    decision_maker_name: string | null;
  } | null;
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

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function LeadCard({ purchase }: { purchase: PurchasedLead }) {
  const lead = purchase.vending_requests;
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

  const handleDownloadReceipt = useCallback(async () => {
    if (!lead) return;
    setDownloadingReceipt(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import("jspdf/dist/jspdf.es.min.js");
      const jsPDF = mod.jsPDF ?? mod.default;
      const doc = new jsPDF({ unit: "pt", format: "letter" });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 50;
      let y = 60;

      // Header — VendingConnector branding
      doc.setFontSize(22);
      doc.setTextColor(22, 163, 74);
      doc.text("VendingConnector", pageWidth / 2, y, { align: "center" });
      y += 24;
      doc.setFontSize(12);
      doc.setTextColor(107, 114, 128);
      doc.text("Purchase Receipt", pageWidth / 2, y, { align: "center" });
      y += 12;
      doc.setFontSize(10);
      doc.text("Your lead purchase has been confirmed.", pageWidth / 2, y, {
        align: "center",
      });
      y += 30;

      // Divider
      doc.setDrawColor(229, 231, 235);
      doc.line(margin, y, pageWidth - margin, y);
      y += 25;

      // Lead details section
      doc.setFontSize(13);
      doc.setTextColor(17, 24, 39);
      doc.text("Lead Details", margin, y);
      y += 20;

      const leadRows: [string, string][] = [
        ["Location Name", lead.location_name || "N/A"],
        ["City / State", `${lead.city}, ${lead.state}`],
        ["Address", lead.address || "N/A"],
        [
          "Machine Types",
          lead.machine_types_wanted.join(", ") || "N/A",
        ],
        ["Price Paid", formatCurrency(purchase.amount_cents)],
      ];

      doc.setFontSize(10);
      for (const [label, value] of leadRows) {
        doc.setTextColor(107, 114, 128);
        doc.text(label, margin, y);
        doc.setTextColor(17, 24, 39);
        const maxWidth = pageWidth - margin - 180;
        const lines = doc.splitTextToSize(value, maxWidth);
        doc.text(lines, pageWidth - margin, y, { align: "right" });
        y += Math.max(lines.length, 1) * 14 + 4;
      }

      y += 10;
      doc.setDrawColor(229, 231, 235);
      doc.line(margin, y, pageWidth - margin, y);
      y += 25;

      // Purchase info section
      doc.setFontSize(13);
      doc.setTextColor(17, 24, 39);
      doc.text("Purchase Information", margin, y);
      y += 20;

      const purchaseRows: [string, string][] = [
        ["Buyer Email", purchase.buyer_email || "N/A"],
        ["Purchase Date", formatDateTime(purchase.created_at)],
        ["Order ID", purchase.id],
        [
          "Stripe Reference",
          purchase.stripe_checkout_session_id || "N/A",
        ],
      ];

      doc.setFontSize(10);
      for (const [label, value] of purchaseRows) {
        doc.setTextColor(107, 114, 128);
        doc.text(label, margin, y);
        doc.setTextColor(17, 24, 39);
        const maxWidth = pageWidth - margin - 180;
        const lines = doc.splitTextToSize(value, maxWidth);
        doc.text(lines, pageWidth - margin, y, { align: "right" });
        y += Math.max(lines.length, 1) * 14 + 4;
      }

      y += 10;
      doc.setDrawColor(229, 231, 235);
      doc.line(margin, y, pageWidth - margin, y);
      y += 25;

      // Amount paid
      doc.setFontSize(13);
      doc.setTextColor(17, 24, 39);
      doc.text("Amount Paid", margin, y);
      doc.setFontSize(18);
      doc.setTextColor(22, 163, 74);
      doc.text(formatCurrency(purchase.amount_cents), pageWidth - margin, y, {
        align: "right",
      });
      y += 40;

      // Footer
      doc.setFontSize(9);
      doc.setTextColor(156, 163, 175);
      doc.text(
        "Thank you for your purchase! Questions? contact@bytebitevending.com",
        pageWidth / 2,
        y,
        { align: "center" }
      );

      doc.save(`receipt-${lead.title.replace(/\s+/g, "-").toLowerCase()}.pdf`);
    } catch {
      // silently fail — user can retry
    } finally {
      setDownloadingReceipt(false);
    }
  }, [lead, purchase]);

  if (!lead) return null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4">
        <h3 className="font-semibold text-black-primary text-base leading-snug">
          {lead.title}
        </h3>
        <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-600">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>
            {lead.city}, {lead.state}
          </span>
        </div>
      </div>

      {/* Card body — full unblurred details */}
      <div className="px-6 py-5 space-y-4">
        {/* Location info */}
        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-start gap-2">
            <Building2 className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
            <div>
              <p className="text-xs font-medium text-gray-500">
                Location Name
              </p>
              <p className="text-sm text-black-primary">
                {lead.location_name}
              </p>
            </div>
          </div>

          {lead.address && (
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-500">Address</p>
                <p className="text-sm text-black-primary">
                  {lead.address}
                  {lead.zip && `, ${lead.zip}`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Contact info */}
        <div className="rounded-lg bg-green-50 border border-green-100 p-3 space-y-2">
          {lead.decision_maker_name && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-green-600 shrink-0" />
              <span className="text-sm text-black-primary">
                {lead.decision_maker_name}
              </span>
            </div>
          )}
          {lead.contact_phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-green-600 shrink-0" />
              <a
                href={`tel:${lead.contact_phone}`}
                className="text-sm text-green-700 hover:underline"
              >
                {lead.contact_phone}
              </a>
            </div>
          )}
          {lead.contact_email && (
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-green-600 shrink-0" />
              <a
                href={`mailto:${lead.contact_email}`}
                className="text-sm text-green-700 hover:underline"
              >
                {lead.contact_email}
              </a>
            </div>
          )}
          {!lead.decision_maker_name &&
            !lead.contact_phone &&
            !lead.contact_email && (
              <p className="text-sm text-gray-500 italic">
                Contact info pending — the admin will update this shortly.
              </p>
            )}
        </div>

        {/* Machine types */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">
            Machine Types
          </p>
          <div className="flex flex-wrap gap-1">
            {lead.machine_types_wanted.map((mt) => (
              <MachineTypeBadge key={mt} type={mt} size="sm" />
            ))}
          </div>
        </div>

        {/* Price + purchase date row */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-1 text-sm">
            <DollarSign className="w-3.5 h-3.5 text-green-600" />
            <span className="font-semibold text-green-700">
              {formatCurrency(purchase.amount_cents)}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            Purchased {formatDate(purchase.created_at)}
          </div>
        </div>
      </div>

      {/* Card footer — Download Receipt */}
      <div className="border-t border-gray-100 px-6 py-3">
        <button
          onClick={handleDownloadReceipt}
          disabled={downloadingReceipt}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloadingReceipt ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating PDF...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Download Receipt (PDF)
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function YourLeadsPage() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<PurchasedLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPurchases() {
      try {
        const res = await fetch("/api/user/purchases");

        if (res.status === 401) {
          router.push("/login?redirect=/your-leads");
          return;
        }

        if (res.ok) {
          const data = await res.json();
          setPurchases(data.purchases ?? []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }

    fetchPurchases();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-160px)] bg-light">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="skeleton h-8 w-48 mb-2" />
          <div className="skeleton h-5 w-64 mb-8" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="skeleton mb-3 h-5 w-3/4" />
                <div className="skeleton mb-2 h-4 w-1/2" />
                <div className="flex gap-2 mt-3">
                  <div className="skeleton h-5 w-16 rounded-full" />
                  <div className="skeleton h-5 w-16 rounded-full" />
                </div>
                <div className="skeleton mt-4 h-4 w-1/3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50">
              <ShoppingBag className="h-6 w-6 text-green-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-black-primary">
                Your Leads
              </h1>
              <p className="mt-1 text-sm text-black-primary/50">
                All leads you have purchased — full details unlocked
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {purchases.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 px-6 py-16 text-center">
            <ShoppingBag className="mb-4 h-12 w-12 text-black-primary/20" />
            <h2 className="text-lg font-semibold text-black-primary">
              You haven&apos;t purchased any leads yet.
            </h2>
            <p className="mt-2 text-sm text-black-primary/50 max-w-md">
              Browse available requests and purchase leads to unlock full
              location details and contact information.
            </p>
            <Link
              href="/browse-requests"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-green-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
            >
              <Search className="h-4 w-4" />
              Browse Requests
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {purchases.map((purchase) => (
              <LeadCard key={purchase.id} purchase={purchase} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
