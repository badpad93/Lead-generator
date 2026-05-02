"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useRealtimeSubscription } from "@/lib/useRealtimeSubscription";
import {
  ArrowLeft,
  MapPin,
  Users,
  HandCoins,
  DollarSign,
  Clock,
  Eye,
  Loader2,
  AlertCircle,
  ArrowRight,
  Lock,
  Mail,
  CheckCircle,
  CreditCard,
  Download,
  Phone,
  User,
} from "lucide-react";
import type { VendingRequest, Profile } from "@/lib/types";
import { LOCATION_TYPES } from "@/lib/types";
import { calculateFees, FEE_EXEMPT_ROLES } from "@/lib/checkoutFees";
import MachineTypeBadge from "../../components/MachineTypeBadge";
import UrgencyBadge from "../../components/UrgencyBadge";
import LocationTypeIcon from "../../components/LocationTypeIcon";
import LeadPurchaseAgreement from "../../components/LeadPurchaseAgreement";


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const created = new Date(dateStr);
  const diffMs = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  const months = Math.floor(diffDays / 30);
  if (months === 1) return "1 month ago";
  return `${months} months ago`;
}

function getStatusConfig(status: string): {
  bg: string;
  text: string;
  ring: string;
  label: string;
} {
  switch (status) {
    case "open":
      return {
        bg: "bg-green-50",
        text: "text-green-700",
        ring: "ring-green-200",
        label: "Open",
      };
    case "matched":
      return {
        bg: "bg-amber-50",
        text: "text-amber-700",
        ring: "ring-amber-200",
        label: "Matched",
      };
    case "closed":
      return {
        bg: "bg-slate-50",
        text: "text-slate-600",
        ring: "ring-slate-200",
        label: "Closed",
      };
    default:
      return {
        bg: "bg-gray-50",
        text: "text-gray-600",
        ring: "ring-gray-200",
        label: status,
      };
  }
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Receipt data stored in component state after purchase check
// ---------------------------------------------------------------------------

interface ReceiptData {
  orderId: string;
  amountCents: number;
  purchaseDate: string;
  stripeSessionId: string | null;
  buyerEmail: string | null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Loading skeleton for the request detail */
function DetailSkeleton() {
  return (
    <div className="min-h-screen bg-light">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="skeleton h-4 w-32 mb-8" />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-start gap-4">
                <div className="skeleton h-12 w-12 rounded-lg" />
                <div className="flex-1 space-y-3">
                  <div className="skeleton h-6 w-3/4" />
                  <div className="skeleton h-5 w-20 rounded-full" />
                </div>
              </div>
              <div className="mt-6 space-y-4">
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-4 w-2/3" />
              </div>
              <div className="mt-6 flex gap-2">
                <div className="skeleton h-6 w-16 rounded-full" />
                <div className="skeleton h-6 w-20 rounded-full" />
                <div className="skeleton h-6 w-14 rounded-full" />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="skeleton h-16 rounded-lg" />
                <div className="skeleton h-16 rounded-lg" />
                <div className="skeleton h-16 rounded-lg" />
                <div className="skeleton h-16 rounded-lg" />
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="skeleton h-5 w-48 mb-4" />
              <div className="skeleton h-10 w-full rounded-lg mb-3" />
              <div className="skeleton h-10 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Similar request card (compact) */
function SimilarRequestCard({ request }: { request: VendingRequest }) {
  return (
    <Link
      href={`/requests/${request.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-4 transition-shadow hover:shadow-lg hover:shadow-green-primary/5 group"
    >
      <div className="flex items-start gap-3">
        <LocationTypeIcon type={request.location_type} size="sm" />
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold text-black-primary text-sm leading-snug truncate group-hover:text-green-primary transition-colors">
            {request.title}
          </h4>
          <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {request.city}, {request.state}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {request.machine_types_wanted.slice(0, 3).map((mt) => (
          <MachineTypeBadge key={mt} type={mt} size="sm" />
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
        <UrgencyBadge urgency={request.urgency} />
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-primary">
          View
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function RequestDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const [request, setRequest] = useState<VendingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [similarRequests, setSimilarRequests] = useState<VendingRequest[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [isPurchased, setIsPurchased] = useState(false);
  const [purchasedByAnyone, setPurchasedByAnyone] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const [buyerEmail, setBuyerEmail] = useState<string | null>(null);
  const [leadInfoComplete, setLeadInfoComplete] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [showAgreement, setShowAgreement] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [feesExempt, setFeesExempt] = useState(false);
  const justPurchased = searchParams.get("purchased") === "true";

  // Fetch main request — re-fetch when purchase is detected to get full data
  const fetchRequest = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/requests/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Request not found");
        } else {
          setError("Failed to load request");
        }
        return;
      }

      const data = await res.json();
      setRequest(data);
    } catch {
      setError("Failed to load request. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRequest();
  }, [fetchRequest, isPurchased]);

  useEffect(() => {
    async function checkRole() {
      try {
        const { createBrowserClient } = await import("@/lib/supabase");
        const supabase = createBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single() as { data: { role: string } | null };
          if (profile?.role && FEE_EXEMPT_ROLES.includes(profile.role)) setFeesExempt(true);
        }
      } catch {
        // not logged in — fees apply
      }
    }
    checkRole();
  }, []);

  // Fetch similar requests
  useEffect(() => {
    if (!request) return;

    async function fetchSimilar() {
      setLoadingSimilar(true);
      try {
        const params = new URLSearchParams();
        params.set("state", request!.state);
        params.set("per_page", "4");
        params.set("page", "0");

        const res = await fetch(`/api/requests?${params}`);
        if (res.ok) {
          const data = await res.json();
          const items: VendingRequest[] = data.requests ?? data.data ?? [];
          // Filter out the current request
          const filtered = items
            .filter((r) => r.id !== request!.id)
            .slice(0, 3);
          setSimilarRequests(filtered);
        }
      } catch {
        // Silently fail for similar requests
      } finally {
        setLoadingSimilar(false);
      }
    }

    fetchSimilar();
  }, [request]);

  // Check if the user (or anyone) has purchased this lead.
  const checkPurchase = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/purchases?requestId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setPurchasedByAnyone(!!data.purchasedByAnyone);
        if (data.purchased) {
          setIsPurchased(true);
          setBuyerEmail(data.buyerEmail ?? null);
          setLeadInfoComplete(data.leadInfoComplete ?? false);
          setReceiptData({
            orderId: data.orderId,
            amountCents: data.amountCents,
            purchaseDate: data.purchaseDate,
            stripeSessionId: data.stripeSessionId ?? null,
            buyerEmail: data.buyerEmail ?? null,
          });
        }
      }
    } catch {
      // Silently fail
    }
  }, [id]);

  // When returning from Stripe, verify the purchase first then check status
  useEffect(() => {
    if (!id) return;

    async function verifyAndCheck() {
      if (justPurchased) {
        try {
          await fetch("/api/verify-purchase", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId: id }),
          });
        } catch {
          // Continue to normal check even if verify fails
        }
      }
      await checkPurchase();
    }

    verifyAndCheck();
  }, [id, justPurchased, checkPurchase]);

  // Live-update when lead data or purchase status changes
  useRealtimeSubscription(
    id
      ? [
          {
            table: "vending_requests",
            filter: `id=eq.${id}`,
            event: "UPDATE",
            onEvent: () => {
              fetchRequest();
              checkPurchase();
            },
          },
          {
            table: "lead_purchases",
            filter: `request_id=eq.${id}`,
            event: "UPDATE",
            onEvent: ({ new: row }) => {
              if (row?.status === "completed") {
                setIsPurchased(true);
                fetchRequest();
                checkPurchase();
              }
            },
          },
        ]
      : [],
    [id, fetchRequest, checkPurchase]
  );

  async function handlePurchase() {
    // Show agreement modal instead of going directly to checkout
    setPurchaseError(null);
    try {
      // Fetch user email for the agreement form
      const { createBrowserClient } = await import("@/lib/supabase");
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserEmail(user?.email || "");
    } catch {
      // continue without email - user can see it in the form
    }
    setShowAgreement(true);
  }

  async function handleAgreementSigned(agreementId: string) {
    setShowAgreement(false);
    setPurchasing(true);
    setPurchaseError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, agreementId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPurchaseError(data.error || "Failed to create checkout session");
        return;
      }
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch {
      setPurchaseError("Something went wrong. Please try again.");
    } finally {
      setPurchasing(false);
    }
  }

  const handleDownloadReceipt = useCallback(async () => {
    if (!receiptData || !request) return;
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

      doc.setDrawColor(229, 231, 235);
      doc.line(margin, y, pageWidth - margin, y);
      y += 25;

      // Lead details
      doc.setFontSize(13);
      doc.setTextColor(17, 24, 39);
      doc.text("Lead Details", margin, y);
      y += 20;

      const leadRows: [string, string][] = [
        ["Location Name", request.location_name || request.title],
        ["City / State", `${request.city}, ${request.state}`],
        ["Address", request.address || "N/A"],
        ["Machine Types", request.machine_types_wanted?.join(", ") || "N/A"],
        ["Price Paid", formatCurrency(receiptData.amountCents)],
      ];

      doc.setFontSize(10);
      for (const [label, value] of leadRows) {
        doc.setTextColor(107, 114, 128);
        doc.text(label, margin, y);
        doc.setTextColor(17, 24, 39);
        doc.text(value, pageWidth - margin, y, { align: "right" });
        y += 18;
      }

      y += 10;
      doc.setDrawColor(229, 231, 235);
      doc.line(margin, y, pageWidth - margin, y);
      y += 25;

      // Purchase info
      doc.setFontSize(13);
      doc.setTextColor(17, 24, 39);
      doc.text("Purchase Information", margin, y);
      y += 20;

      const purchaseRows: [string, string][] = [
        ["Buyer Email", receiptData.buyerEmail || "N/A"],
        ["Purchase Date", formatDate(receiptData.purchaseDate)],
        ["Order ID", receiptData.orderId],
        ["Stripe Reference", receiptData.stripeSessionId || "N/A"],
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

      // Amount
      doc.setFontSize(13);
      doc.setTextColor(17, 24, 39);
      doc.text("Amount Paid", margin, y);
      doc.setFontSize(18);
      doc.setTextColor(22, 163, 74);
      doc.text(formatCurrency(receiptData.amountCents), pageWidth - margin, y, {
        align: "right",
      });
      y += 40;

      doc.setFontSize(9);
      doc.setTextColor(156, 163, 175);
      doc.text(
        "Thank you for your purchase! Questions? james@apexaivending.com | (888) 851-1462",
        pageWidth / 2,
        y,
        { align: "center" }
      );

      doc.save("receipt.pdf");
    } catch {
      // silently fail — user can retry
    } finally {
      setDownloadingReceipt(false);
    }
  }, [receiptData, request]);

  // ---------- Loading state ----------
  if (loading) return <DetailSkeleton />;

  // ---------- Error state ----------
  if (error || !request) {
    return (
      <div className="min-h-screen bg-light">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-black-primary">
              {error || "Request not found"}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              The request you are looking for may have been removed or does not
              exist.
            </p>
            <Link
              href="/browse-requests"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-green-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-hover"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Locations for Sale
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(request.status);
  const locationLabel =
    LOCATION_TYPES.find((lt) => lt.value === request.location_type)?.label ??
    request.location_type;

  // For purchased leads: determine if we should show contact details (Case A)
  // or the "please wait" message (Case B)
  const showContactDetails = isPurchased && leadInfoComplete;
  const showWaitingMessage = isPurchased && !leadInfoComplete;

  return (
    <div className="min-h-screen bg-light">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/browse-requests"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-green-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Locations for Sale
        </Link>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* ---------------------------------------------------------------- */}
          {/* Main content */}
          {/* ---------------------------------------------------------------- */}
          <div className="lg:col-span-2 space-y-6">
            {/* Request card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 animate-fade-in">
              {/* Header */}
              <div className="flex items-start gap-4">
                <LocationTypeIcon type={request.location_type} size="lg" />
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-bold text-black-primary sm:text-2xl leading-tight">
                    {request.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full ring-1 ring-inset ${statusConfig.bg} ${statusConfig.text} ${statusConfig.ring}`}
                    >
                      {statusConfig.label}
                    </span>
                    <UrgencyBadge urgency={request.urgency} />
                  </div>
                </div>
              </div>

              {/* Description */}
              {request.description && !/Original seller|Imported lead/i.test(request.description) && (
                <div className="mt-6">
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {request.description}
                  </p>
                </div>
              )}

              {/* Seller Name */}
              {request.seller_name && (
                <div className="mt-4 flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Seller: <span className="font-medium text-black-primary">{request.seller_name}</span>
                  </span>
                </div>
              )}

              {/* Location Info */}
              <div className="mt-6 rounded-lg bg-light border border-green-100 p-4">
                <h3 className="text-sm font-semibold text-black-primary mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-green-primary" />
                  Location Details
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Business name — only shown after purchase */}
                  {isPurchased && request.location_name && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                        Business Name
                      </p>
                      <p className="text-sm font-medium text-black-primary mt-0.5">
                        {request.location_name}
                      </p>
                    </div>
                  )}
                  {/* Address — only shown after purchase */}
                  {isPurchased && request.address && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                        Address
                      </p>
                      <p className="text-sm font-medium text-black-primary mt-0.5">
                        {request.address}
                      </p>
                    </div>
                  )}
                  {request.city && request.state && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                        City / State
                      </p>
                      <p className="text-sm font-medium text-black-primary mt-0.5">
                        {request.city}, {request.state}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                      Location Type
                    </p>
                    <p className="text-sm font-medium text-black-primary mt-0.5 flex items-center gap-1.5">
                      <LocationTypeIcon
                        type={request.location_type}
                        size="sm"
                      />
                      {locationLabel}
                    </p>
                  </div>
                  {/* Zip — only shown after purchase */}
                  {isPurchased && request.zip && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                        Zip Code
                      </p>
                      <p className="text-sm font-medium text-black-primary mt-0.5">
                        {request.zip}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Contact Details — only shown for purchased leads */}
              {isPurchased && (
                <div className="mt-6 rounded-lg border border-green-200 bg-green-50/50 p-4">
                  <h3 className="text-sm font-semibold text-black-primary mb-3 flex items-center gap-2">
                    <User className="h-4 w-4 text-green-primary" />
                    Contact Details
                  </h3>

                  {showContactDetails ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {request.decision_maker_name && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                            Decision Maker
                          </p>
                          <p className="text-sm font-medium text-black-primary mt-0.5 flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-gray-400" />
                            {request.decision_maker_name}
                          </p>
                        </div>
                      )}
                      {request.contact_phone && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                            Phone
                          </p>
                          <p className="text-sm font-medium text-black-primary mt-0.5 flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-gray-400" />
                            <a
                              href={`tel:${request.contact_phone}`}
                              className="text-green-primary hover:underline"
                            >
                              {request.contact_phone}
                            </a>
                          </p>
                        </div>
                      )}
                      {request.contact_email && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                            Email
                          </p>
                          <p className="text-sm font-medium text-black-primary mt-0.5 flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-gray-400" />
                            <a
                              href={`mailto:${request.contact_email}`}
                              className="text-green-primary hover:underline"
                            >
                              {request.contact_email}
                            </a>
                          </p>
                        </div>
                      )}
                    </div>
                  ) : showWaitingMessage ? (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                      <div className="flex items-start gap-3">
                        <Clock className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-amber-800">
                            Please wait 5–10 minutes
                          </p>
                          <p className="text-sm text-amber-700 mt-1">
                            An email with the full lead information will be sent
                            to:{" "}
                            <span className="font-semibold">
                              {buyerEmail || "your checkout email"}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Machine Types */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-black-primary mb-2">
                  Machine Types Wanted
                </h3>
                <div className="flex flex-wrap gap-2">
                  {request.machine_types_wanted.map((mt) => (
                    <MachineTypeBadge key={mt} type={mt} size="md" />
                  ))}
                </div>
              </div>

              {/* Details Grid */}
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Daily Traffic */}
                {request.estimated_daily_traffic !== null && (
                  <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                    <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
                      <Users className="h-3.5 w-3.5" />
                      Estimated Daily Traffic
                    </div>
                    <p className="mt-1 text-lg font-bold text-black-primary">
                      {request.estimated_daily_traffic.toLocaleString()}
                      <span className="text-sm font-normal text-gray-500 ml-1">
                        people / day
                      </span>
                    </p>
                  </div>
                )}

                {/* Price */}
                {request.price != null && (() => {
                  const priceCents = Math.round(request.price * 100);
                  const leadFees = !feesExempt && priceCents > 0 ? calculateFees(priceCents) : { brokerFeeCents: 0, processingFeeCents: 0, totalFeeCents: 0 };
                  const totalCents = priceCents + leadFees.totalFeeCents;
                  return (
                    <div className="rounded-lg bg-green-50 p-4 border border-green-100">
                      <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
                        <DollarSign className="h-3.5 w-3.5" />
                        Price
                      </div>
                      <p className="mt-1 text-2xl font-bold text-green-700">
                        ${request.price.toLocaleString()}
                      </p>
                      {leadFees.totalFeeCents > 0 && (
                        <div className="mt-2 pt-2 border-t border-green-200 space-y-0.5">
                          <div className="flex justify-between text-xs text-green-700/70">
                            <span>Broker Fee (5%)</span>
                            <span>${(leadFees.brokerFeeCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-xs text-green-700/70">
                            <span>Processing Fee (2.9%)</span>
                            <span>${(leadFees.processingFeeCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-sm font-bold text-green-700 pt-1">
                            <span>Total</span>
                            <span>${(totalCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Commission */}
                <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
                    <HandCoins className="h-3.5 w-3.5" />
                    Commission
                  </div>
                  <p className="mt-1">
                    {request.commission_offered ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        Commission Offered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500">
                        <span className="h-2 w-2 rounded-full bg-gray-400" />
                        No Commission
                      </span>
                    )}
                  </p>
                  {request.commission_notes && (
                    <p className="mt-1.5 text-xs text-gray-500 italic">
                      {request.commission_notes}
                    </p>
                  )}
                </div>

                {/* Views */}
                <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
                    <Eye className="h-3.5 w-3.5" />
                    Views
                  </div>
                  <p className="mt-1 text-lg font-bold text-black-primary">
                    {request.views.toLocaleString()}
                  </p>
                </div>
              </div>


              {/* Timestamps */}
              <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Posted {formatDate(request.created_at)} ({timeAgo(request.created_at)})
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {request.views.toLocaleString()} views
                </span>
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Sidebar */}
          {/* ---------------------------------------------------------------- */}
          <div className="space-y-6">
            {/* Purchase CTA Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24 animate-fade-in">
              {isPurchased || justPurchased ? (
                <>
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="h-5 w-5" />
                    <h3 className="text-lg font-bold">Lead Purchased</h3>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    You have full access to this lead&apos;s details. Reach out to
                    the location directly to start the placement process.
                  </p>

                  {/* Download Receipt Button */}
                  <button
                    onClick={handleDownloadReceipt}
                    disabled={downloadingReceipt || !receiptData}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
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
                </>
              ) : purchasedByAnyone ? (
                <>
                  <div className="flex items-center gap-2 text-amber-700">
                    <Lock className="h-5 w-5" />
                    <h3 className="text-lg font-bold">This lead has been purchased</h3>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    This lead has already been purchased by another user and is no longer available.
                  </p>
                  <Link
                    href="/browse-requests"
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-green-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
                  >
                    Browse Other Leads
                  </Link>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-black-primary">
                    Interested in this location?
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Purchase this lead to unlock full location details, or contact the admin to get connected.
                  </p>

                  {request.price != null && request.price > 0 ? (
                    <>
                      {(() => {
                        const btnPriceCents = Math.round(request.price * 100);
                        const btnFees = !feesExempt ? calculateFees(btnPriceCents) : { totalFeeCents: 0 };
                        const btnTotal = (btnPriceCents + btnFees.totalFeeCents) / 100;
                        return (
                          <button
                            onClick={handlePurchase}
                            disabled={purchasing}
                            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-green-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {purchasing ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Redirecting to payment...
                              </>
                            ) : (
                              <>
                                <CreditCard className="h-4 w-4" />
                                Purchase This Lead — ${btnTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </>
                            )}
                          </button>
                        );
                      })()}
                      {purchaseError && (
                        <p className="mt-2 text-xs text-red-600">{purchaseError}</p>
                      )}
                    </>
                  ) : (
                    <a
                      href="mailto:james@apexaivending.com?subject=Lead%20Purchase%20Inquiry&body=I%20am%20interested%20in%20purchasing%20a%20lead.%20Request%20ID:%20${id}"
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-green-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
                    >
                      <Mail className="h-4 w-4" />
                      Contact Admin for Pricing
                    </a>
                  )}

                  <a
                    href="mailto:james@apexaivending.com"
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-black-primary transition-colors hover:border-green-primary/40 hover:bg-green-50"
                  >
                    <Mail className="h-4 w-4" />
                    Contact Admin
                  </a>
                  <a
                    href="tel:+18888511462"
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-black-primary transition-colors hover:border-green-primary/40 hover:bg-green-50"
                  >
                    <Phone className="h-4 w-4" />
                    (888) 851-1462
                  </a>
                </>
              )}

              <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Status</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ring-1 ring-inset ${statusConfig.bg} ${statusConfig.text} ${statusConfig.ring}`}
                  >
                    {statusConfig.label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Urgency</span>
                  <UrgencyBadge urgency={request.urgency} />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Commission</span>
                  <span className="font-medium text-black-primary">
                    {request.commission_offered ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick info card */}
            <div className="bg-gradient-to-br from-green-50 to-light-warm rounded-xl border border-green-100 p-5">
              <h4 className="text-sm font-semibold text-black-primary mb-2">
                How it works
              </h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                Browse available locations by city, state, and industry for free.
                Purchase individual leads to unlock full details, or contact the
                admin to get connected with the location.
              </p>
              <Link
                href="/pricing"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-green-primary hover:text-green-hover transition-colors"
              >
                Learn More
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Similar Requests */}
        {/* ------------------------------------------------------------------ */}
        {(loadingSimilar || similarRequests.length > 0) && (
          <section className="mt-12">
            <h2 className="text-lg font-bold text-black-primary mb-5">
              Similar Requests Nearby
            </h2>

            {loadingSimilar && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading similar requests...
              </div>
            )}

            {!loadingSimilar && similarRequests.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {similarRequests.map((req) => (
                  <SimilarRequestCard key={req.id} request={req} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Lead Purchase Agreement Modal */}
      {showAgreement && request && request.price != null && (
        <LeadPurchaseAgreement
          leadId={id}
          leadTitle={request.title}
          leadPrice={request.price}
          userEmail={currentUserEmail}
          onSigned={handleAgreementSigned}
          onCancel={() => setShowAgreement(false)}
        />
      )}
    </div>
  );
}
