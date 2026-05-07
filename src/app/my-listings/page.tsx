"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Loader2,
  MapPin,
  DollarSign,
  Trash2,
  Edit3,
  Eye,
  Package,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  X,
} from "lucide-react";
import { getAccessToken } from "@/lib/auth";
import { US_STATES } from "@/lib/types";

interface UserListing {
  id: string;
  title: string;
  description: string | null;
  listing_type: "lead" | "location" | "route";
  price: number;
  city: string | null;
  state: string | null;
  status: string;
  is_public: boolean;
  created_at: string;
}

interface ConnectStatus {
  connected: boolean;
  onboarding_complete: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
}

const LISTING_TYPE_LABELS: Record<string, string> = {
  lead: "Vending Lead",
  location: "Location",
  route: "Route",
};

function formatPrice(val: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);
}

function daysAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MyListingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<UserListing[]>([]);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    listing_type: "lead" as "lead" | "location" | "route",
    price: "",
    city: "",
    state: "",
    zip: "",
    entity_type: "",
    business_type: "",
    foot_traffic: "",
    square_footage: "",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
  });

  const fetchData = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      router.push("/login?redirect=/my-listings");
      return;
    }

    const [statusRes, listingsRes] = await Promise.all([
      fetch("/api/connect/status", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/user-listings?seller_id=me", { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    if (statusRes.ok) {
      setConnectStatus(await statusRes.json());
    }

    if (listingsRes.ok) {
      const data = await listingsRes.json();
      setListings(data.listings || []);
    }

    setLoading(false);
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  async function handleConnectStripe() {
    setConnectLoading(true);
    const token = await getAccessToken();
    const res = await fetch("/api/connect/onboard", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { url } = await res.json();
      window.location.href = url;
    } else {
      const data = await res.json();
      setError(data.error || "Failed to start Stripe onboarding");
    }
    setConnectLoading(false);
  }

  async function handleStripeDashboard() {
    const token = await getAccessToken();
    const res = await fetch("/api/connect/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { url } = await res.json();
      window.open(url, "_blank");
    }
  }

  async function handleCreate() {
    setError(null);
    if (!form.title.trim()) { setError("Title is required"); return; }
    if (!form.price || Number(form.price) < 100 || Number(form.price) > 10000) {
      setError("Price must be between $100 and $10,000");
      return;
    }
    if (!form.state) { setError("State is required"); return; }

    setCreating(true);
    const token = await getAccessToken();
    const res = await fetch("/api/user-listings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...form, price: Number(form.price) }),
    });

    if (res.ok) {
      setShowCreate(false);
      setForm({
        title: "", description: "", listing_type: "lead", price: "", city: "", state: "", zip: "",
        entity_type: "", business_type: "", foot_traffic: "", square_footage: "",
        contact_name: "", contact_phone: "", contact_email: "",
      });
      setToast("Listing created!");
      fetchData();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to create listing");
    }
    setCreating(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this listing?")) return;
    const token = await getAccessToken();
    const res = await fetch(`/api/user-listings/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setToast("Listing removed");
      fetchData();
    }
  }

  const inputClass = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none";

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-160px)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4" /> {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Listings</h1>
          <p className="text-gray-500 text-sm mt-1">Post leads, locations, or routes for sale on the marketplace</p>
        </div>
        {connectStatus?.onboarding_complete && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Listing
          </button>
        )}
      </div>

      {/* Stripe Connect Status */}
      {!connectStatus?.onboarding_complete && (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-900">Connect Your Stripe Account</h3>
              <p className="text-amber-800 text-sm mt-1">
                To sell on the marketplace, you need to connect a Stripe account so you can receive payouts.
                VendingConnector takes a 15% platform fee — the rest goes directly to your bank.
              </p>
              <button
                onClick={handleConnectStripe}
                disabled={connectLoading}
                className="mt-4 inline-flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {connectLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                {connectStatus?.connected ? "Complete Stripe Setup" : "Connect Stripe"}
              </button>
            </div>
          </div>
        </div>
      )}

      {connectStatus?.onboarding_complete && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <span className="text-green-800 text-sm font-medium">Stripe connected — payouts enabled</span>
          <button
            onClick={handleStripeDashboard}
            className="ml-auto text-green-700 text-sm font-medium hover:underline flex items-center gap-1"
          >
            Stripe Dashboard <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Create Listing Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Create Listing</h2>
              <button onClick={() => { setShowCreate(false); setError(null); }}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            {error && (
              <div className="mb-4 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Listing Type <span className="text-red-500">*</span></label>
                <select value={form.listing_type} onChange={(e) => setForm(f => ({ ...f, listing_type: e.target.value as "lead" | "location" | "route" }))} className={inputClass}>
                  <option value="lead">Vending Lead</option>
                  <option value="location">Location</option>
                  <option value="route">Route</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Title <span className="text-red-500">*</span></label>
                <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. High-traffic gym location in Dallas" className={inputClass} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Describe the opportunity..." className={inputClass} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Price ($100 – $10,000) <span className="text-red-500">*</span></label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input type="number" min={100} max={10000} value={form.price} onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))} placeholder="500" className={`${inputClass} pl-8`} />
                </div>
                <p className="text-xs text-gray-400 mt-1">You'll receive 85% — VendingConnector takes a 15% platform fee</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                  <input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">State <span className="text-red-500">*</span></label>
                  <select value={form.state} onChange={(e) => setForm(f => ({ ...f, state: e.target.value }))} className={inputClass}>
                    <option value="">Select</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Zip</label>
                  <input value={form.zip} onChange={(e) => setForm(f => ({ ...f, zip: e.target.value }))} maxLength={10} className={inputClass} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Business Type</label>
                <input value={form.business_type} onChange={(e) => setForm(f => ({ ...f, business_type: e.target.value }))} placeholder="e.g. Gym, Office, Hospital" className={inputClass} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Foot Traffic</label>
                  <input value={form.foot_traffic} onChange={(e) => setForm(f => ({ ...f, foot_traffic: e.target.value }))} placeholder="e.g. 500/day" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Square Footage</label>
                  <input value={form.square_footage} onChange={(e) => setForm(f => ({ ...f, square_footage: e.target.value }))} placeholder="e.g. 5000 sq ft" className={inputClass} />
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs font-medium text-gray-500 mb-3">Contact Info (shared with buyer after purchase)</p>
                <div className="space-y-3">
                  <input value={form.contact_name} onChange={(e) => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Contact name" className={inputClass} />
                  <div className="grid grid-cols-2 gap-3">
                    <input value={form.contact_phone} onChange={(e) => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="Phone" className={inputClass} />
                    <input value={form.contact_email} onChange={(e) => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="Email" className={inputClass} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowCreate(false); setError(null); }} className="flex-1 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating} className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Post Listing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Listings Grid */}
      {listings.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border border-gray-100">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-700 mb-1">No listings yet</h3>
          <p className="text-gray-500 text-sm">
            {connectStatus?.onboarding_complete
              ? "Create your first listing to start selling on the marketplace."
              : "Connect Stripe above to start posting listings."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <div key={l.id} className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  l.status === "active" ? "bg-green-100 text-green-700" :
                  l.status === "sold" ? "bg-blue-100 text-blue-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {l.status === "active" ? "Active" : l.status === "sold" ? "Sold" : l.status}
                </span>
                <span className="text-xs text-gray-400">{daysAgo(l.created_at)}</span>
              </div>
              <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2">{l.title}</h3>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                <span className="bg-gray-100 px-2 py-0.5 rounded-full">{LISTING_TYPE_LABELS[l.listing_type]}</span>
                {l.city && l.state && (
                  <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{l.city}, {l.state}</span>
                )}
              </div>
              <div className="mt-auto pt-3 flex items-center justify-between border-t border-gray-100">
                <span className="font-bold text-green-700">{formatPrice(l.price)}</span>
                <div className="flex gap-1">
                  <Link href={`/marketplace/${l.id}`} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="View">
                    <Eye className="h-4 w-4" />
                  </Link>
                  {l.status === "active" && (
                    <button onClick={() => handleDelete(l.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" title="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
