"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Check,
  ChevronLeft,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { getAccessToken } from "@/lib/auth";
import { MACHINE_TYPES, LOCATION_TYPES, US_STATES, US_STATE_NAMES } from "@/lib/types";

export default function PostRoutePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [numMachines, setNumMachines] = useState("1");
  const [numLocations, setNumLocations] = useState("1");
  const [monthlyRevenue, setMonthlyRevenue] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [machineTypes, setMachineTypes] = useState<string[]>([]);
  const [locationTypes, setLocationTypes] = useState<string[]>([]);
  const [includesEquipment, setIncludesEquipment] = useState(true);
  const [includesContracts, setIncludesContracts] = useState(true);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  useEffect(() => {
    getAccessToken().then(setToken);
  }, []);

  function toggleMachineType(type: string) {
    setMachineTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function toggleLocationType(type: string) {
    setLocationTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!title.trim()) { setSubmitError("Title is required"); return; }
    if (!city.trim()) { setSubmitError("City is required"); return; }
    if (!state) { setSubmitError("State is required"); return; }
    if (machineTypes.length === 0) { setSubmitError("Select at least one machine type"); return; }

    setSubmitting(true);
    try {
      const currentToken = token || await getAccessToken();
      if (!currentToken) {
        setSubmitError("You must be logged in. Please sign in first.");
        return;
      }

      const res = await fetch("/api/routes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          city: city.trim(),
          state,
          num_machines: parseInt(numMachines) || 1,
          num_locations: parseInt(numLocations) || 1,
          monthly_revenue: monthlyRevenue ? parseFloat(monthlyRevenue) : undefined,
          asking_price: askingPrice ? parseFloat(askingPrice) : undefined,
          machine_types: machineTypes,
          location_types: locationTypes,
          includes_equipment: includesEquipment,
          includes_contracts: includesContracts,
          contact_email: contactEmail.trim() || undefined,
          contact_phone: contactPhone.trim() || undefined,
        }),
      });

      if (!res.ok) {
        try {
          const data = await res.json();
          setSubmitError(typeof data.error === "string" ? data.error : "Something went wrong.");
        } catch {
          setSubmitError("Something went wrong.");
        }
        return;
      }

      router.push("/routes-for-sale");
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
          href="/routes-for-sale"
          className="inline-flex items-center gap-1.5 text-sm text-black-primary/60 hover:text-green-primary transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Routes for Sale
        </Link>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-black-primary">Post a Route for Sale</h1>
          <p className="text-black-primary/60 mt-2">
            List your vending route or business for interested buyers.
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
              Route Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 15-Machine Snack Route in Denver Metro"
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
              placeholder="Describe your route — locations, revenue history, growth potential, reason for selling..."
              maxLength={5000}
            />
          </div>

          {/* City & State */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="city" className="block text-sm font-medium text-black-primary mb-1.5">
                City <span className="text-red-500">*</span>
              </label>
              <input
                id="city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Denver"
                maxLength={100}
              />
            </div>
            <div>
              <label htmlFor="state" className="block text-sm font-medium text-black-primary mb-1.5">
                State <span className="text-red-500">*</span>
              </label>
              <select
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
              >
                <option value="">Select state</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s} - {US_STATE_NAMES[s] ?? s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Machines & Locations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="numMachines" className="block text-sm font-medium text-black-primary mb-1.5">
                Number of Machines <span className="text-red-500">*</span>
              </label>
              <input
                id="numMachines"
                type="number"
                min="1"
                max="10000"
                value={numMachines}
                onChange={(e) => setNumMachines(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="numLocations" className="block text-sm font-medium text-black-primary mb-1.5">
                Number of Locations <span className="text-red-500">*</span>
              </label>
              <input
                id="numLocations"
                type="number"
                min="1"
                max="10000"
                value={numLocations}
                onChange={(e) => setNumLocations(e.target.value)}
              />
            </div>
          </div>

          {/* Revenue & Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="monthlyRevenue" className="block text-sm font-medium text-black-primary mb-1.5">
                Monthly Revenue ($) <span className="text-black-primary/30 font-normal">(optional)</span>
              </label>
              <input
                id="monthlyRevenue"
                type="number"
                min="0"
                step="0.01"
                value={monthlyRevenue}
                onChange={(e) => setMonthlyRevenue(e.target.value)}
                placeholder="e.g. 5000"
              />
            </div>
            <div>
              <label htmlFor="askingPrice" className="block text-sm font-medium text-black-primary mb-1.5">
                Asking Price ($) <span className="text-black-primary/30 font-normal">(optional)</span>
              </label>
              <input
                id="askingPrice"
                type="number"
                min="0"
                step="0.01"
                value={askingPrice}
                onChange={(e) => setAskingPrice(e.target.value)}
                placeholder="e.g. 75000"
              />
            </div>
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

          {/* Location Types */}
          <div>
            <label className="block text-sm font-medium text-black-primary mb-3">
              Location Types <span className="text-black-primary/30 font-normal">(optional)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {LOCATION_TYPES.map(({ value, label }) => {
                const selected = locationTypes.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleLocationType(value)}
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

          {/* Includes Equipment Toggle */}
          <div className="flex items-center justify-between bg-green-50 rounded-xl p-4">
            <div>
              <p className="text-sm font-semibold text-black-primary">Includes Equipment?</p>
              <p className="text-xs text-black-primary/50 mt-0.5">
                Are the vending machines included in the sale?
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={includesEquipment}
              onClick={() => setIncludesEquipment(!includesEquipment)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors ${
                includesEquipment ? "bg-green-primary" : "bg-gray-300"
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform mt-1 ${
                includesEquipment ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          {/* Includes Contracts Toggle */}
          <div className="flex items-center justify-between bg-green-50 rounded-xl p-4">
            <div>
              <p className="text-sm font-semibold text-black-primary">Includes Contracts?</p>
              <p className="text-xs text-black-primary/50 mt-0.5">
                Are existing location contracts included in the sale?
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={includesContracts}
              onClick={() => setIncludesContracts(!includesContracts)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors ${
                includesContracts ? "bg-green-primary" : "bg-gray-300"
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform mt-1 ${
                includesContracts ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="contactEmail" className="block text-sm font-medium text-black-primary mb-1.5">
                Contact Email <span className="text-black-primary/30 font-normal">(optional)</span>
              </label>
              <input
                id="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="contactPhone" className="block text-sm font-medium text-black-primary mb-1.5">
                Contact Phone <span className="text-black-primary/30 font-normal">(optional)</span>
              </label>
              <input
                id="contactPhone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="(555) 123-4567"
                maxLength={20}
              />
            </div>
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
                  Posting Route...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Post Route for Sale
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
