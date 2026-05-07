"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  MapPin,
  DollarSign,
  ShoppingCart,
  CheckCircle2,
  Building2,
  Users,
  Ruler,
  User,
  AlertCircle,
} from "lucide-react";
import { getAccessToken } from "@/lib/auth";

interface ListingDetail {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  listing_type: string;
  price: number;
  city: string | null;
  state: string | null;
  zip: string | null;
  entity_type: string | null;
  business_type: string | null;
  foot_traffic: string | null;
  square_footage: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: string;
  created_at: string;
  profiles?: {
    full_name: string | null;
    company_name: string | null;
    city: string | null;
    state: string | null;
  };
}

const TYPE_LABELS: Record<string, string> = {
  lead: "Vending Lead",
  location: "Location",
  route: "Route",
};

function formatPrice(val: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const purchased = searchParams.get("purchased") === "true";
  const canceled = searchParams.get("canceled") === "true";

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/user-listings/${id}`);
      if (res.ok) {
        setListing(await res.json());
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handlePurchase() {
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      router.push(`/login?redirect=/marketplace/${id}`);
      return;
    }

    setPurchasing(true);
    const res = await fetch(`/api/user-listings/${id}/checkout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const { url } = await res.json();
      window.location.href = url;
    } else {
      const data = await res.json();
      setError(data.error || "Failed to start checkout");
    }
    setPurchasing(false);
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-160px)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-primary" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Listing Not Found</h1>
        <p className="text-gray-500 mb-4">This listing may have been removed or sold.</p>
        <Link href="/marketplace" className="text-green-600 font-medium hover:underline">← Back to Marketplace</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/marketplace" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to Marketplace
      </Link>

      {purchased && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-green-900">Purchase Complete!</p>
            <p className="text-green-800 text-sm">The seller has been notified and you'll receive a confirmation email.</p>
          </div>
        </div>
      )}

      {canceled && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-amber-800 text-sm">Payment was canceled. You can try again when you're ready.</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
              {TYPE_LABELS[listing.listing_type] || listing.listing_type}
            </span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              listing.status === "active" ? "bg-blue-100 text-blue-700" :
              listing.status === "sold" ? "bg-gray-100 text-gray-600" : "bg-gray-100 text-gray-600"
            }`}>
              {listing.status === "active" ? "Available" : listing.status}
            </span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">{listing.title}</h1>

          {listing.description && (
            <p className="text-gray-600 text-sm leading-relaxed mb-6">{listing.description}</p>
          )}

          {/* Details grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            {(listing.city || listing.state) && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500">Location</p>
                  <p className="text-sm font-medium text-gray-900">{[listing.city, listing.state].filter(Boolean).join(", ")}</p>
                </div>
              </div>
            )}
            {listing.business_type && (
              <div className="flex items-start gap-2">
                <Building2 className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500">Business Type</p>
                  <p className="text-sm font-medium text-gray-900">{listing.business_type}</p>
                </div>
              </div>
            )}
            {listing.foot_traffic && (
              <div className="flex items-start gap-2">
                <Users className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500">Foot Traffic</p>
                  <p className="text-sm font-medium text-gray-900">{listing.foot_traffic}</p>
                </div>
              </div>
            )}
            {listing.square_footage && (
              <div className="flex items-start gap-2">
                <Ruler className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500">Square Footage</p>
                  <p className="text-sm font-medium text-gray-900">{listing.square_footage}</p>
                </div>
              </div>
            )}
            {listing.profiles?.full_name && (
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500">Seller</p>
                  <p className="text-sm font-medium text-gray-900">{listing.profiles.full_name}</p>
                </div>
              </div>
            )}
          </div>

          {/* Price + Buy */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Price</p>
                <p className="text-3xl font-bold text-green-700">{formatPrice(listing.price)}</p>
              </div>
              {listing.status === "active" && (
                <button
                  onClick={handlePurchase}
                  disabled={purchasing}
                  className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {purchasing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <ShoppingCart className="h-5 w-5" />
                  )}
                  Buy Now
                </button>
              )}
              {listing.status === "sold" && (
                <span className="text-gray-500 font-medium text-sm">Sold</span>
              )}
            </div>
            {error && (
              <p className="text-red-600 text-sm mt-3">{error}</p>
            )}
            <p className="text-xs text-gray-400 mt-3">
              Secure payment via Stripe. Contact details are shared after purchase.
            </p>
          </div>

          {/* Posted date */}
          <p className="text-xs text-gray-400 mt-4">
            Posted {new Date(listing.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>
    </div>
  );
}
