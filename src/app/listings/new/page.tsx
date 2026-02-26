"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Check,
  ChevronLeft,
  MapPin,
  Package,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { getAccessToken } from "@/lib/auth";
import { MACHINE_TYPES, US_STATES } from "@/lib/types";

export default function NewListingPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [machineTypes, setMachineTypes] = useState<string[]>([]);
  const [statesServed, setStatesServed] = useState<string[]>([]);
  const [citiesServed, setCitiesServed] = useState<string[]>([]);
  const [cityInput, setCityInput] = useState("");
  const [serviceRadius, setServiceRadius] = useState("50");
  const [acceptsCommission, setAcceptsCommission] = useState(true);
  const [minDailyTraffic, setMinDailyTraffic] = useState("0");
  const [machineCount, setMachineCount] = useState("1");

  useEffect(() => {
    getAccessToken().then(setToken);
  }, []);

  function toggleMachineType(type: string) {
    setMachineTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function toggleState(st: string) {
    setStatesServed((prev) =>
      prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]
    );
  }

  function addCity() {
    const trimmed = cityInput.trim();
    if (trimmed && !citiesServed.includes(trimmed)) {
      setCitiesServed((prev) => [...prev, trimmed]);
      setCityInput("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!title.trim()) { setSubmitError("Title is required"); return; }
    if (machineTypes.length === 0) { setSubmitError("Select at least one machine type"); return; }
    if (statesServed.length === 0) { setSubmitError("Select at least one state"); return; }

    setSubmitting(true);
    try {
      const currentToken = token || await getAccessToken();
      if (!currentToken) {
        setSubmitError("You must be logged in. Please sign in first.");
        return;
      }

      const res = await fetch("/api/operators", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          machine_types: machineTypes,
          states_served: statesServed,
          cities_served: citiesServed,
          service_radius_miles: parseInt(serviceRadius) || 50,
          accepts_commission: acceptsCommission,
          min_daily_traffic: parseInt(minDailyTraffic) || 0,
          machine_count_available: parseInt(machineCount) || 1,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setSubmitError(typeof data.error === "string" ? data.error : "Something went wrong.");
        return;
      }

      router.push("/dashboard");
    } catch {
      setSubmitError("Network error. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-160px)] px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-black-primary/60 hover:text-green-primary transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-black-primary">Create New Listing</h1>
          <p className="text-black-primary/60 mt-2">
            Let location managers know about your vending services.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-6">
          {submitError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-black-primary mb-1.5">
              Listing Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Denver Metro Vending Services"
              maxLength={200}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-black-primary mb-1.5">
              Description <span className="text-black-primary/30 font-normal">(optional)</span>
            </label>
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell location managers about your services, experience, and what sets you apart..."
              maxLength={2000}
            />
          </div>

          {/* Machine Types */}
          <div>
            <label className="block text-sm font-medium text-black-primary mb-3">
              Machine Types <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MACHINE_TYPES.map(({ value, label }) => {
                const selected = machineTypes.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleMachineType(value)}
                    className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all cursor-pointer ${
                      selected
                        ? "border-green-primary bg-light-warm text-green-primary"
                        : "border-gray-100 text-black-primary/70 hover:border-gray-200"
                    }`}
                  >
                    {selected && <Check className="w-3.5 h-3.5 inline mr-1" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* States Served */}
          <div>
            <label className="block text-sm font-medium text-black-primary mb-3">
              States Served <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-3 border border-gray-100 rounded-xl">
              {US_STATES.map((st) => {
                const selected = statesServed.includes(st);
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => toggleState(st)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                      selected
                        ? "bg-green-primary text-white"
                        : "bg-gray-50 text-black-primary/60 hover:bg-gray-100"
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cities Served */}
          <div>
            <label className="block text-sm font-medium text-black-primary mb-1.5">
              Cities Served <span className="text-black-primary/30 font-normal">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCity(); } }}
                placeholder="Type a city and press Enter"
                className="flex-1"
              />
              <button
                type="button"
                onClick={addCity}
                className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {citiesServed.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {citiesServed.map((city) => (
                  <span key={city} className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-primary text-xs font-medium rounded-full">
                    {city}
                    <button type="button" onClick={() => setCitiesServed((prev) => prev.filter((c) => c !== city))} className="cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Number fields row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="serviceRadius" className="block text-sm font-medium text-black-primary mb-1.5">
                Service Radius (mi)
              </label>
              <input
                id="serviceRadius"
                type="number"
                min="1"
                max="500"
                value={serviceRadius}
                onChange={(e) => setServiceRadius(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="minTraffic" className="block text-sm font-medium text-black-primary mb-1.5">
                Min Daily Traffic
              </label>
              <input
                id="minTraffic"
                type="number"
                min="0"
                value={minDailyTraffic}
                onChange={(e) => setMinDailyTraffic(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="machineCount" className="block text-sm font-medium text-black-primary mb-1.5">
                Machines Available
              </label>
              <input
                id="machineCount"
                type="number"
                min="1"
                max="1000"
                value={machineCount}
                onChange={(e) => setMachineCount(e.target.value)}
              />
            </div>
          </div>

          {/* Accepts Commission */}
          <div className="flex items-center justify-between bg-green-50 rounded-xl p-4">
            <div>
              <p className="text-sm font-semibold text-black-primary">Accepts Commission?</p>
              <p className="text-xs text-black-primary/50 mt-0.5">
                Let managers know you are open to commission-based placements.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={acceptsCommission}
              onClick={() => setAcceptsCommission(!acceptsCommission)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors ${
                acceptsCommission ? "bg-green-primary" : "bg-gray-300"
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform mt-1 ${
                acceptsCommission ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-primary hover:bg-green-hover text-white rounded-xl font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating Listing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Create Listing
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
