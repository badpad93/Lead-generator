"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  User,
  Building2,
  MapPin,
  Clock,
  Wifi,
  Truck,
  CheckSquare,
  ShoppingCart,
} from "lucide-react";

interface Listing {
  id: string;
  title: string;
  buy_now_enabled: boolean;
  buy_now_price: number | null;
  asking_price: number | null;
  status: string;
  image_thumb_url: string | null;
  photos: string[];
}

const PLACEMENT_TYPES = [
  "Office",
  "Gym",
  "Hotel",
  "School",
  "Warehouse",
  "Apartment",
  "Hospital",
  "Retail",
  "Government",
  "Other",
];

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function CheckoutFormPage() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [buyerType, setBuyerType] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [llcStatus, setLlcStatus] = useState("");
  const [locationStatus, setLocationStatus] = useState("");

  // Existing location fields
  const [locationBusinessName, setLocationBusinessName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [locationState, setLocationState] = useState("");
  const [locationZip, setLocationZip] = useState("");
  const [siteContactName, setSiteContactName] = useState("");
  const [siteContactPhone, setSiteContactPhone] = useState("");
  const [siteContactEmail, setSiteContactEmail] = useState("");
  const [placementType, setPlacementType] = useState("");

  // No location fields
  const [preferredMarket, setPreferredMarket] = useState("");
  const [desiredLocationType, setDesiredLocationType] = useState("");
  const [footTraffic, setFootTraffic] = useState("");

  // Deployment
  const [deploymentTimeline, setDeploymentTimeline] = useState("");

  // Site readiness
  const [siteReadinessUnsure, setSiteReadinessUnsure] = useState(false);
  const [hasPowerOutlet, setHasPowerOutlet] = useState(false);
  const [hasIndoorPlacement, setHasIndoorPlacement] = useState(false);
  const [hasEnoughSpace, setHasEnoughSpace] = useState(false);
  const [hasDeliveryAccess, setHasDeliveryAccess] = useState(false);

  // Connectivity
  const [connectivity, setConnectivity] = useState("");

  // Shipping
  const [shippingIntent, setShippingIntent] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/machine-listings/${id}`);
      if (res.ok) {
        const data = await res.json();
        setListing(data);
      } else {
        setError("Listing not found");
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!listing) return;

    if (!fullName.trim() || !email.trim() || !phone.trim()) {
      setError("Please fill in all required fields (name, email, phone).");
      return;
    }
    if (!buyerType) {
      setError("Please select your buyer type.");
      return;
    }
    if (!locationStatus) {
      setError("Please select your location status.");
      return;
    }
    if (!deploymentTimeline) {
      setError("Please select your deployment timeline.");
      return;
    }
    if (!shippingIntent) {
      setError("Please select your shipping preference.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/machine-listings/${listing.id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          buyer_type: buyerType,
          business_name: businessName.trim() || null,
          llc_status: llcStatus || null,
          location_status: locationStatus,
          location_business_name: locationBusinessName.trim() || null,
          location_address: locationAddress.trim() || null,
          location_city: locationCity.trim() || null,
          location_state: locationState.trim() || null,
          location_zip: locationZip.trim() || null,
          site_contact_name: siteContactName.trim() || null,
          site_contact_phone: siteContactPhone.trim() || null,
          site_contact_email: siteContactEmail.trim() || null,
          placement_type: placementType || null,
          preferred_market: preferredMarket.trim() || null,
          desired_location_type: desiredLocationType.trim() || null,
          foot_traffic: footTraffic || null,
          deployment_timeline: deploymentTimeline,
          has_power_outlet: hasPowerOutlet,
          has_indoor_placement: hasIndoorPlacement,
          has_enough_space: hasEnoughSpace,
          has_delivery_access: hasDeliveryAccess,
          connectivity: connectivity || null,
          shipping_intent: shippingIntent,
        }),
      });

      if (res.ok) {
        const { url } = await res.json();
        if (url) window.location.href = url;
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to start checkout. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Listing Not Found</h1>
          <Link href="/machines-for-sale" className="text-sm text-green-600 hover:underline">
            Back to Machines for Sale
          </Link>
        </div>
      </div>
    );
  }

  const price = listing.buy_now_price || (listing.asking_price ? listing.asking_price * 100 : null);
  const showExistingLocation = locationStatus === "confirmed";
  const showNoLocation = locationStatus === "securing" || locationStatus === "need_help";

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <Link
          href={`/machines-for-sale/${listing.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-600 transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to listing
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Complete Your Purchase</h1>
          <p className="text-sm text-gray-500 mt-1">
            {listing.title}
            {price ? ` — ${formatCurrency(price)}` : ""}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Section 1: Buyer Identity */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-green-600" />
                <h2 className="text-sm font-semibold text-gray-900">Buyer Information</h2>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Full Name *</label>
                <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone *</label>
                  <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Buyer Type *</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "individual_operator", label: "Individual Operator" },
                    { value: "business_owner", label: "Business Owner" },
                    { value: "investor", label: "Investor (no location yet)" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBuyerType(opt.value)}
                      className={`rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
                        buyerType === opt.value
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-gray-200 text-gray-600 hover:border-green-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Business Info */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-green-600" />
                <h2 className="text-sm font-semibold text-gray-900">Business Information</h2>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Business Name</label>
                <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Enter business name or TBD" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm placeholder:text-gray-300 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Do you have an LLC formed?</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                    { value: "in_progress", label: "In Progress" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLlcStatus(opt.value)}
                      className={`rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
                        llcStatus === opt.value
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-gray-200 text-gray-600 hover:border-green-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Location Status */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-green-600" />
                <h2 className="text-sm font-semibold text-gray-900">Location Status *</h2>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-2">
                {[
                  { value: "confirmed", label: "I have a confirmed location" },
                  { value: "securing", label: "I am actively securing a location" },
                  { value: "need_help", label: "I need help finding a location" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLocationStatus(opt.value)}
                    className={`w-full rounded-lg border px-4 py-3 text-sm text-left font-medium transition-colors cursor-pointer ${
                      locationStatus === opt.value
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-gray-200 text-gray-600 hover:border-green-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Existing location fields */}
              {showExistingLocation && (
                <div className="mt-4 space-y-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Location Details</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Business Name at Location</label>
                    <input type="text" value={locationBusinessName} onChange={(e) => setLocationBusinessName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                    <input type="text" value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                      <input type="text" value={locationCity} onChange={(e) => setLocationCity(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
                      <input type="text" value={locationState} onChange={(e) => setLocationState(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">ZIP</label>
                      <input type="text" value={locationZip} onChange={(e) => setLocationZip(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider pt-2">Site Contact</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Contact Name</label>
                      <input type="text" value={siteContactName} onChange={(e) => setSiteContactName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Contact Phone</label>
                      <input type="tel" value={siteContactPhone} onChange={(e) => setSiteContactPhone(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Contact Email</label>
                      <input type="email" value={siteContactEmail} onChange={(e) => setSiteContactEmail(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Placement Type</label>
                    <div className="flex flex-wrap gap-2">
                      {PLACEMENT_TYPES.map((pt) => (
                        <button
                          key={pt}
                          type="button"
                          onClick={() => setPlacementType(pt)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                            placementType === pt
                              ? "border-green-500 bg-green-50 text-green-700"
                              : "border-gray-200 text-gray-500 hover:border-green-300"
                          }`}
                        >
                          {pt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* No location fields */}
              {showNoLocation && (
                <div className="mt-4 space-y-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Target Placement Info</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Preferred City / Market</label>
                    <input type="text" value={preferredMarket} onChange={(e) => setPreferredMarket(e.target.value)} placeholder="e.g. Denver, CO" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm placeholder:text-gray-300 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Type of Location Desired</label>
                    <input type="text" value={desiredLocationType} onChange={(e) => setDesiredLocationType(e.target.value)} placeholder="e.g. Office building, gym" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm placeholder:text-gray-300 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Foot Traffic Expectation</label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { value: "low", label: "Low (<50/day)" },
                        { value: "medium", label: "Medium (50–200/day)" },
                        { value: "high", label: "High (200+/day)" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setFootTraffic(opt.value)}
                          className={`rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
                            footTraffic === opt.value
                              ? "border-green-500 bg-green-50 text-green-700"
                              : "border-gray-200 text-gray-600 hover:border-green-300"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Deployment Timeline */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-green-600" />
                <h2 className="text-sm font-semibold text-gray-900">Deployment Timeline *</h2>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "asap", label: "ASAP" },
                  { value: "30_days", label: "Within 30 Days" },
                  { value: "60_90_days", label: "60–90 Days" },
                  { value: "90_plus_days", label: "90+ Days" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDeploymentTimeline(opt.value)}
                    className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors cursor-pointer ${
                      deploymentTimeline === opt.value
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-gray-200 text-gray-600 hover:border-green-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 5: Site Readiness */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-green-600" />
                <h2 className="text-sm font-semibold text-gray-900">Site Readiness</h2>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={siteReadinessUnsure}
                  onChange={(e) => {
                    setSiteReadinessUnsure(e.target.checked);
                    if (e.target.checked) {
                      setHasPowerOutlet(false);
                      setHasIndoorPlacement(false);
                      setHasEnoughSpace(false);
                      setHasDeliveryAccess(false);
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm text-gray-700 font-medium">Unsure at this time</span>
              </label>
              {!siteReadinessUnsure && (
                <>
                  {[
                    { checked: hasPowerOutlet, set: setHasPowerOutlet, label: "Location has standard power outlet (110V)" },
                    { checked: hasIndoorPlacement, set: setHasIndoorPlacement, label: "Indoor placement available" },
                    { checked: hasEnoughSpace, set: setHasEnoughSpace, label: "Enough space (~3 ft x 3 ft)" },
                    { checked: hasDeliveryAccess, set: setHasDeliveryAccess, label: "Delivery access (doorways, no major obstructions)" },
                  ].map((item) => (
                    <label key={item.label} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => item.set(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-gray-700">{item.label}</span>
                    </label>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Section 6: Connectivity */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-green-600" />
                <h2 className="text-sm font-semibold text-gray-900">Connectivity</h2>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: "wifi", label: "WiFi Available" },
                  { value: "no_wifi", label: "No WiFi (may need 4G)" },
                  { value: "not_sure", label: "Unsure at this time" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setConnectivity(opt.value)}
                    className={`rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
                      connectivity === opt.value
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-gray-200 text-gray-600 hover:border-green-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 7: Shipping */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-green-600" />
                <h2 className="text-sm font-semibold text-gray-900">Shipping Preference *</h2>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="space-y-2">
                {[
                  { value: "ship_immediately", label: "Ship immediately (if ready)" },
                  { value: "hold_until_secured", label: "Hold until location is secured" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setShippingIntent(opt.value)}
                    className={`w-full rounded-lg border px-4 py-3 text-sm text-left font-medium transition-colors cursor-pointer ${
                      shippingIntent === opt.value
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-gray-200 text-gray-600 hover:border-green-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-green-600 px-6 py-4 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <ShoppingCart className="h-5 w-5" />
                Proceed to Payment{price ? ` — ${formatCurrency(price)}` : ""}
              </>
            )}
          </button>

          <p className="text-xs text-gray-400 text-center mt-3">
            You will be redirected to Stripe for secure payment processing.
          </p>
        </form>
      </div>
    </div>
  );
}
