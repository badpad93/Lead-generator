"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getAccessToken } from "@/lib/auth";
import {
  MapPin,
  Package,
  FileText,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Edit3,
  Cookie,
  Coffee,
  Snowflake,
  UtensilsCrossed,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Heart,
  GlassWater,
  MessageSquare,
  Mail,
  Phone,
  Clock,
  CalendarClock,
  AlertCircle,
  Rocket,
  Globe,
  Lock,
  Info,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
  "DC",
] as const;

const LOCATION_TYPES = [
  "Office/Corporate",
  "Apartment/Residential",
  "Gym/Fitness Center",
  "School/University",
  "Hospital/Medical",
  "Hotel/Hospitality",
  "Warehouse/Industrial",
  "Retail/Shopping",
  "Government/Public",
  "Other",
] as const;

const MACHINE_TYPES = [
  { label: "Snack", icon: Cookie },
  { label: "Beverage/Soda", icon: GlassWater },
  { label: "Combo", icon: Package },
  { label: "Healthy/Organic", icon: Heart },
  { label: "Coffee/Hot Drinks", icon: Coffee },
  { label: "Frozen/Ice Cream", icon: Snowflake },
  { label: "Fresh Food/Meals", icon: UtensilsCrossed },
  { label: "Personal Care/PPE", icon: ShieldCheck },
  { label: "Electronics/Accessories", icon: Smartphone },
  { label: "Custom/Specialty", icon: Sparkles },
] as const;

const CONTACT_PREFERENCES = [
  { value: "platform", label: "Platform Messages", icon: MessageSquare },
  { value: "email", label: "Email", icon: Mail },
  { value: "phone", label: "Phone", icon: Phone },
] as const;

const URGENCY_OPTIONS = [
  { value: "flexible", label: "Flexible", description: "No rush", icon: Clock },
  { value: "1_month", label: "Within 1 Month", description: "Moderate", icon: CalendarClock },
  { value: "2_weeks", label: "Within 2 Weeks", description: "Soon", icon: AlertCircle },
  { value: "asap", label: "ASAP", description: "Urgent", icon: Rocket },
] as const;

const STEPS = [
  { label: "Location", icon: MapPin },
  { label: "Machine", icon: Package },
  { label: "Terms", icon: FileText },
  { label: "Review", icon: CheckCircle2 },
] as const;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FormData {
  /* Step 1 */
  locationName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  locationType: string;
  /* Step 2 */
  machineTypes: string[];
  dailyFootTraffic: string;
  additionalNotes: string;
  /* Step 3 */
  commissionOffered: boolean;
  commissionNotes: string;
  contactPreference: string;
  urgency: string;
  makePublic: boolean;
}

const initialFormData: FormData = {
  locationName: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  locationType: "",
  machineTypes: [],
  dailyFootTraffic: "",
  additionalNotes: "",
  commissionOffered: false,
  commissionNotes: "",
  contactPreference: "platform",
  urgency: "flexible",
  makePublic: true,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PostRequestPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    getAccessToken().then(setToken);
  }, []);

  /* ---- helpers ---- */

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function toggleMachineType(type: string) {
    setFormData((prev) => ({
      ...prev,
      machineTypes: prev.machineTypes.includes(type)
        ? prev.machineTypes.filter((t) => t !== type)
        : [...prev.machineTypes, type],
    }));
    if (errors.machineTypes) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.machineTypes;
        return next;
      });
    }
  }

  /* ---- validation ---- */

  function validateStep(step: number): boolean {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (step === 1) {
      if (!formData.locationName.trim()) newErrors.locationName = "Location name is required";
      if (!formData.city.trim()) newErrors.city = "City is required";
      if (!formData.state) newErrors.state = "State is required";
      if (!formData.locationType) newErrors.locationType = "Location type is required";
    }

    if (step === 2) {
      if (formData.machineTypes.length === 0) newErrors.machineTypes = "Select at least one machine type";
    }

    if (step === 3) {
      if (!formData.contactPreference) newErrors.contactPreference = "Select a contact preference";
      if (!formData.urgency) newErrors.urgency = "Select urgency";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleNext() {
    if (validateStep(currentStep)) {
      setCurrentStep((s) => Math.min(s + 1, 4));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleBack() {
    setCurrentStep((s) => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToStep(step: number) {
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---- submit ---- */

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const currentToken = token || await getAccessToken();
      if (!currentToken) {
        setSubmitError("You must be logged in to post a request. Please sign in first.");
        return;
      }

      const res = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          location_name: formData.locationName,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          location_type: formData.locationType,
          machine_types: formData.machineTypes,
          daily_foot_traffic: formData.dailyFootTraffic ? Number(formData.dailyFootTraffic) : null,
          additional_notes: formData.additionalNotes,
          commission_offered: formData.commissionOffered,
          commission_notes: formData.commissionNotes,
          contact_preference: formData.contactPreference,
          urgency: formData.urgency,
          make_public: formData.makePublic,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setRequestId(data.id || data.request_id || "NEW");
      setSubmitted(true);
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ================================================================ */
  /*  Render: Success Screen                                          */
  /* ================================================================ */

  if (submitted) {
    return (
      <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center animate-fade-in">
          {/* Success icon with glow */}
          <div className="relative mx-auto mb-6 w-24 h-24">
            <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
            <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <Check className="w-12 h-12 text-white" strokeWidth={3} />
            </div>
          </div>

          {/* Decorative dots (confetti feel) */}
          <div className="flex justify-center gap-1.5 mb-6">
            {["bg-green-primary", "bg-emerald-400", "bg-amber-400", "bg-blue-400", "bg-pink-400", "bg-green-primary"].map(
              (color, i) => (
                <span
                  key={i}
                  className={`inline-block w-2 h-2 rounded-full ${color}`}
                  style={{ animation: `pulse-dot 1.2s ease-in-out ${i * 0.15}s infinite` }}
                />
              )
            )}
          </div>

          <h1 className="text-2xl font-bold text-black-primary mb-2">Your request has been posted!</h1>
          <p className="text-black-primary/60 mb-2">
            Operators in your area will be notified and can respond to your request.
          </p>
          {requestId && (
            <p className="text-sm text-black-primary/40 mb-8">
              Request ID: <span className="font-mono font-medium text-black-primary/60">{requestId}</span>
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {requestId && requestId !== "NEW" && (
              <Link
                href={`/requests/${requestId}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-primary hover:bg-green-hover text-white font-semibold rounded-xl transition-colors shadow-sm"
              >
                View Request
                <ChevronRight className="w-4 h-4" />
              </Link>
            )}
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border border-gray-200 text-black-primary font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Render: Multi-step Form                                         */
  /* ================================================================ */

  return (
    <div className="min-h-[calc(100vh-160px)] px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        {/* ---- Page title ---- */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-black-primary">Post a Vending Request</h1>
          <p className="text-black-primary/60 mt-2">
            Tell operators about your location and what you need.
          </p>
        </div>

        {/* ---- Step indicator ---- */}
        <nav className="mb-10">
          <ol className="flex items-center justify-between">
            {STEPS.map((step, idx) => {
              const stepNum = idx + 1;
              const isActive = stepNum === currentStep;
              const isCompleted = stepNum < currentStep;
              const isFuture = stepNum > currentStep;

              return (
                <li key={step.label} className="flex-1 flex items-center">
                  {/* Circle + label */}
                  <div className="flex flex-col items-center relative z-10">
                    <button
                      type="button"
                      onClick={() => {
                        if (isCompleted) goToStep(stepNum);
                      }}
                      disabled={isFuture}
                      className={`
                        w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                        transition-all duration-300 cursor-default
                        ${isCompleted ? "bg-emerald-500 text-white cursor-pointer hover:bg-emerald-600 shadow-sm" : ""}
                        ${isActive ? "bg-green-primary text-white shadow-md shadow-green-primary/30" : ""}
                        ${isFuture ? "border-2 border-gray-300 text-gray-400 bg-white" : ""}
                      `}
                    >
                      {isCompleted ? <Check className="w-5 h-5" strokeWidth={3} /> : stepNum}
                    </button>
                    <span
                      className={`
                        mt-2 text-xs font-medium hidden sm:block
                        ${isActive ? "text-green-primary" : ""}
                        ${isCompleted ? "text-emerald-600" : ""}
                        ${isFuture ? "text-gray-400" : ""}
                      `}
                    >
                      {step.label}
                    </span>
                  </div>

                  {/* Connector line */}
                  {idx < STEPS.length - 1 && (
                    <div className="flex-1 mx-2 sm:mx-3">
                      <div
                        className={`h-0.5 rounded-full transition-colors duration-300 ${
                          stepNum < currentStep ? "bg-emerald-400" : "bg-gray-200"
                        }`}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* ---- Form card ---- */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 animate-fade-in">
          {/* Submit error */}
          {submitError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* ============================================ */}
          {/*  Step 1: Location Details                    */}
          {/* ============================================ */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-light-warm flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-green-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-black-primary">Location Details</h2>
                  <p className="text-sm text-black-primary/50">Where do you need the vending machine?</p>
                </div>
              </div>

              {/* Location Name */}
              <div>
                <label htmlFor="locationName" className="block text-sm font-medium text-black-primary mb-1.5">
                  Location Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="locationName"
                  type="text"
                  value={formData.locationName}
                  onChange={(e) => updateField("locationName", e.target.value)}
                  placeholder="e.g. ABC Corp - Downtown Office"
                  className={errors.locationName ? "!border-red-400 !shadow-red-100" : ""}
                />
                {errors.locationName && (
                  <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.locationName}
                  </p>
                )}
              </div>

              {/* Address */}
              <div>
                <label htmlFor="address" className="block text-sm font-medium text-black-primary mb-1.5">
                  Address <span className="text-black-primary/30 font-normal">(optional)</span>
                </label>
                <input
                  id="address"
                  type="text"
                  value={formData.address}
                  onChange={(e) => updateField("address", e.target.value)}
                  placeholder="123 Main Street"
                />
              </div>

              {/* City + State row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-black-primary mb-1.5">
                    City <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="city"
                    type="text"
                    value={formData.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    placeholder="e.g. Austin"
                    className={errors.city ? "!border-red-400 !shadow-red-100" : ""}
                  />
                  {errors.city && (
                    <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {errors.city}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-black-primary mb-1.5">
                    State <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="state"
                    value={formData.state}
                    onChange={(e) => updateField("state", e.target.value)}
                    className={errors.state ? "!border-red-400 !shadow-red-100" : ""}
                  >
                    <option value="">Select state</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {errors.state && (
                    <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {errors.state}
                    </p>
                  )}
                </div>
              </div>

              {/* ZIP + Location Type row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="zip" className="block text-sm font-medium text-black-primary mb-1.5">
                    ZIP Code <span className="text-black-primary/30 font-normal">(optional)</span>
                  </label>
                  <input
                    id="zip"
                    type="text"
                    value={formData.zip}
                    onChange={(e) => updateField("zip", e.target.value)}
                    placeholder="78701"
                    maxLength={10}
                  />
                </div>

                <div>
                  <label htmlFor="locationType" className="block text-sm font-medium text-black-primary mb-1.5">
                    Location Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="locationType"
                    value={formData.locationType}
                    onChange={(e) => updateField("locationType", e.target.value)}
                    className={errors.locationType ? "!border-red-400 !shadow-red-100" : ""}
                  >
                    <option value="">Select type</option>
                    {LOCATION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {errors.locationType && (
                    <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {errors.locationType}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/*  Step 2: Machine Preferences                 */}
          {/* ============================================ */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-light-warm flex items-center justify-center">
                  <Package className="w-5 h-5 text-green-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-black-primary">Machine Preferences</h2>
                  <p className="text-sm text-black-primary/50">What kind of machines are you looking for?</p>
                </div>
              </div>

              {/* Machine types multi-select */}
              <div>
                <label className="block text-sm font-medium text-black-primary mb-3">
                  Machine Types Wanted <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {MACHINE_TYPES.map(({ label, icon: Icon }) => {
                    const selected = formData.machineTypes.includes(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleMachineType(label)}
                        className={`
                          flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer
                          ${
                            selected
                              ? "border-green-primary bg-light-warm shadow-sm"
                              : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50"
                          }
                        `}
                      >
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                            selected ? "bg-green-primary/10" : "bg-gray-100"
                          }`}
                        >
                          <Icon
                            className={`w-5 h-5 transition-colors ${
                              selected ? "text-green-primary" : "text-gray-500"
                            }`}
                          />
                        </div>
                        <span
                          className={`text-xs font-medium text-center leading-tight ${
                            selected ? "text-green-primary" : "text-black-primary/70"
                          }`}
                        >
                          {label}
                        </span>
                        {selected && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-primary rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {errors.machineTypes && (
                  <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.machineTypes}
                  </p>
                )}
              </div>

              {/* Foot traffic */}
              <div>
                <label htmlFor="footTraffic" className="block text-sm font-medium text-black-primary mb-1.5">
                  Estimated Daily Foot Traffic
                </label>
                <input
                  id="footTraffic"
                  type="number"
                  min="0"
                  value={formData.dailyFootTraffic}
                  onChange={(e) => updateField("dailyFootTraffic", e.target.value)}
                  placeholder="e.g. 500"
                />
                <p className="text-xs text-black-primary/40 mt-1">
                  Approximate number of people passing through daily
                </p>
              </div>

              {/* Additional notes */}
              <div>
                <label htmlFor="additionalNotes" className="block text-sm font-medium text-black-primary mb-1.5">
                  Additional Notes <span className="text-black-primary/30 font-normal">(optional)</span>
                </label>
                <textarea
                  id="additionalNotes"
                  rows={4}
                  value={formData.additionalNotes}
                  onChange={(e) => updateField("additionalNotes", e.target.value)}
                  placeholder="Tell operators about the space — available square footage, power outlets, indoor/outdoor, etc."
                />
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/*  Step 3: Terms & Preferences                 */}
          {/* ============================================ */}
          {currentStep === 3 && (
            <div className="space-y-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-light-warm flex items-center justify-center">
                  <FileText className="w-5 h-5 text-green-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-black-primary">Terms & Preferences</h2>
                  <p className="text-sm text-black-primary/50">Set your preferences for this request.</p>
                </div>
              </div>

              {/* Commission toggle */}
              <div className="bg-green-50 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-semibold text-black-primary">Commission Offered?</p>
                    <p className="text-xs text-black-primary/50 mt-1">
                      Let operators know if you are offering a commission or revenue share for placing
                      their machine at your location.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.commissionOffered}
                    onClick={() => updateField("commissionOffered", !formData.commissionOffered)}
                    className={`
                      relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full
                      transition-colors duration-200 ease-in-out focus:outline-none
                      focus-visible:ring-2 focus-visible:ring-green-primary/50
                      ${formData.commissionOffered ? "bg-green-primary" : "bg-gray-300"}
                    `}
                  >
                    <span
                      className={`
                        pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md
                        transform transition-transform duration-200 ease-in-out mt-1
                        ${formData.commissionOffered ? "translate-x-6 ml-0" : "translate-x-1"}
                      `}
                    />
                  </button>
                </div>

                {formData.commissionOffered && (
                  <div className="mt-4">
                    <label htmlFor="commissionNotes" className="block text-sm font-medium text-black-primary mb-1.5">
                      Commission Notes
                    </label>
                    <textarea
                      id="commissionNotes"
                      rows={3}
                      value={formData.commissionNotes}
                      onChange={(e) => updateField("commissionNotes", e.target.value)}
                      placeholder="e.g. 10% of gross revenue, flat $200/month, negotiable..."
                      className="bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Contact Preference */}
              <div>
                <label className="block text-sm font-medium text-black-primary mb-3">
                  Contact Preference <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  {CONTACT_PREFERENCES.map(({ value, label, icon: Icon }) => {
                    const selected = formData.contactPreference === value;
                    return (
                      <label
                        key={value}
                        className={`
                          flex-1 flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                          ${
                            selected
                              ? "border-green-primary bg-light-warm"
                              : "border-gray-100 hover:border-gray-200"
                          }
                        `}
                      >
                        <input
                          type="radio"
                          name="contactPreference"
                          value={value}
                          checked={selected}
                          onChange={() => updateField("contactPreference", value)}
                          className="sr-only"
                        />
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                            selected ? "bg-green-primary/10" : "bg-gray-100"
                          }`}
                        >
                          <Icon
                            className={`w-5 h-5 ${selected ? "text-green-primary" : "text-gray-500"}`}
                          />
                        </div>
                        <span
                          className={`text-sm font-medium ${selected ? "text-green-primary" : "text-black-primary/70"}`}
                        >
                          {label}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {errors.contactPreference && (
                  <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.contactPreference}
                  </p>
                )}
              </div>

              {/* Urgency */}
              <div>
                <label className="block text-sm font-medium text-black-primary mb-3">
                  Urgency <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {URGENCY_OPTIONS.map(({ value, label, description, icon: Icon }) => {
                    const selected = formData.urgency === value;
                    return (
                      <label
                        key={value}
                        className={`
                          flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 cursor-pointer transition-all text-center
                          ${
                            selected
                              ? "border-green-primary bg-light-warm shadow-sm"
                              : "border-gray-100 hover:border-gray-200"
                          }
                        `}
                      >
                        <input
                          type="radio"
                          name="urgency"
                          value={value}
                          checked={selected}
                          onChange={() => updateField("urgency", value)}
                          className="sr-only"
                        />
                        <Icon
                          className={`w-5 h-5 ${selected ? "text-green-primary" : "text-gray-400"}`}
                        />
                        <span
                          className={`text-sm font-semibold ${selected ? "text-green-primary" : "text-black-primary"}`}
                        >
                          {label}
                        </span>
                        <span className="text-[11px] text-black-primary/40">{description}</span>
                      </label>
                    );
                  })}
                </div>
                {errors.urgency && (
                  <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.urgency}
                  </p>
                )}
              </div>

              {/* Make Public toggle */}
              <div className="bg-gray-50 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex-1 mr-4">
                    <div className="flex items-center gap-2">
                      {formData.makePublic ? (
                        <Globe className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Lock className="w-4 h-4 text-gray-500" />
                      )}
                      <p className="text-sm font-semibold text-black-primary">
                        {formData.makePublic ? "Public Request" : "Private Request"}
                      </p>
                    </div>
                    <p className="text-xs text-black-primary/50 mt-1">
                      {formData.makePublic
                        ? "Your request will be visible in the public marketplace for any operator to respond."
                        : "Only operators you invite directly will be able to see this request."}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.makePublic}
                    onClick={() => updateField("makePublic", !formData.makePublic)}
                    className={`
                      relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full
                      transition-colors duration-200 ease-in-out focus:outline-none
                      focus-visible:ring-2 focus-visible:ring-green-primary/50
                      ${formData.makePublic ? "bg-emerald-500" : "bg-gray-300"}
                    `}
                  >
                    <span
                      className={`
                        pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md
                        transform transition-transform duration-200 ease-in-out mt-1
                        ${formData.makePublic ? "translate-x-6 ml-0" : "translate-x-1"}
                      `}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/*  Step 4: Review & Submit                     */}
          {/* ============================================ */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-light-warm flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-black-primary">Review Your Request</h2>
                  <p className="text-sm text-black-primary/50">Double-check everything before submitting.</p>
                </div>
              </div>

              {/* Location info */}
              <ReviewSection
                title="Location Information"
                icon={<MapPin className="w-4 h-4 text-green-primary" />}
                onEdit={() => goToStep(1)}
              >
                <ReviewRow label="Location Name" value={formData.locationName} />
                {formData.address && <ReviewRow label="Address" value={formData.address} />}
                <ReviewRow label="City" value={formData.city} />
                <ReviewRow label="State" value={formData.state} />
                {formData.zip && <ReviewRow label="ZIP Code" value={formData.zip} />}
                <ReviewRow label="Location Type" value={formData.locationType} />
              </ReviewSection>

              {/* Machine preferences */}
              <ReviewSection
                title="Machine Preferences"
                icon={<Package className="w-4 h-4 text-green-primary" />}
                onEdit={() => goToStep(2)}
              >
                <div>
                  <p className="text-xs text-black-primary/50 mb-2">Machine Types</p>
                  <div className="flex flex-wrap gap-2">
                    {formData.machineTypes.map((type) => (
                      <span
                        key={type}
                        className="inline-flex items-center px-3 py-1 bg-light-warm text-green-primary text-xs font-medium rounded-full"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                </div>
                {formData.dailyFootTraffic && (
                  <ReviewRow
                    label="Daily Foot Traffic"
                    value={`~${Number(formData.dailyFootTraffic).toLocaleString()} people`}
                  />
                )}
                {formData.additionalNotes && (
                  <ReviewRow label="Additional Notes" value={formData.additionalNotes} />
                )}
              </ReviewSection>

              {/* Terms */}
              <ReviewSection
                title="Terms & Preferences"
                icon={<FileText className="w-4 h-4 text-green-primary" />}
                onEdit={() => goToStep(3)}
              >
                <ReviewRow
                  label="Commission"
                  value={formData.commissionOffered ? "Yes" : "No"}
                />
                {formData.commissionOffered && formData.commissionNotes && (
                  <ReviewRow label="Commission Notes" value={formData.commissionNotes} />
                )}
                <ReviewRow
                  label="Contact Preference"
                  value={
                    CONTACT_PREFERENCES.find((c) => c.value === formData.contactPreference)?.label ||
                    formData.contactPreference
                  }
                />
                <ReviewRow
                  label="Urgency"
                  value={
                    URGENCY_OPTIONS.find((u) => u.value === formData.urgency)?.label ||
                    formData.urgency
                  }
                />
                <ReviewRow
                  label="Visibility"
                  value={formData.makePublic ? "Public" : "Private"}
                />
              </ReviewSection>

              {/* Info note */}
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl text-sm text-blue-800">
                <Info className="w-5 h-5 shrink-0 mt-0.5 text-blue-500" />
                <p>
                  By submitting, your request will{" "}
                  {formData.makePublic
                    ? "be posted publicly so operators in your area can respond."
                    : "be saved as a private request. You can share it with specific operators later."}
                </p>
              </div>
            </div>
          )}

          {/* ---- Navigation buttons ---- */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-black-primary/70 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            ) : (
              <div />
            )}

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-primary hover:bg-green-hover text-white rounded-xl text-sm font-semibold transition-colors shadow-sm cursor-pointer"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-8 py-3 bg-green-primary hover:bg-green-hover text-white rounded-xl text-sm font-semibold transition-colors shadow-md shadow-green-primary/20 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit Request
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ReviewSection({
  title,
  icon,
  onEdit,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-black-primary">{title}</span>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs font-medium text-green-primary hover:text-green-hover transition-colors cursor-pointer"
        >
          <Edit3 className="w-3.5 h-3.5" />
          Edit
        </button>
      </div>
      <div className="px-5 py-4 space-y-3">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-black-primary/50">{label}</p>
      <p className="text-sm text-black-primary font-medium mt-0.5">{value}</p>
    </div>
  );
}
