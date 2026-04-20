"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { getGuidance, GuidanceItem } from "@/lib/sopGuidance";
import {
  User,
  MapPin,
  Building2,
  ShieldAlert,
  Target,
  FileCheck,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  MessageSquare,
  ChevronRight,
  Upload,
} from "lucide-react";

const MACHINE_TYPES = [
  { value: "snack", label: "Snack" },
  { value: "beverage", label: "Beverage" },
  { value: "combo", label: "Combo" },
  { value: "healthy", label: "Healthy / Organic" },
  { value: "coffee", label: "Coffee" },
  { value: "frozen", label: "Frozen / Ice Cream" },
  { value: "fresh_food", label: "Fresh Food" },
];

const LOCATION_TYPES = [
  { value: "office", label: "Office / Corporate" },
  { value: "gym", label: "Gym / Fitness" },
  { value: "apartment", label: "Apartment / Residential" },
  { value: "school", label: "School / University" },
  { value: "hospital", label: "Hospital / Medical" },
  { value: "hotel", label: "Hotel / Hospitality" },
  { value: "warehouse", label: "Warehouse / Industrial" },
  { value: "retail", label: "Retail / Shopping" },
];

const SECTIONS = [
  { id: "client_info", label: "Client Info", icon: User },
  { id: "placement_details", label: "Placement", icon: MapPin },
  { id: "location_profile", label: "Location Profile", icon: Building2 },
  { id: "restrictions", label: "Restrictions", icon: ShieldAlert },
  { id: "expectations", label: "Expectations", icon: Target },
  { id: "agreement_prep", label: "Agreement Prep", icon: FileCheck },
  { id: "confirmation", label: "Confirm", icon: CheckCircle2 },
];

type FormValues = Record<string, unknown>;

function GuidanceSidebar({ items }: { items: GuidanceItem[] }) {
  if (items.length === 0) return null;

  const typeIcon = (type: string) => {
    switch (type) {
      case "strategy": return <Lightbulb className="h-4 w-4 text-blue-500" />;
      case "script": return <MessageSquare className="h-4 w-4 text-green-600" />;
      case "risk": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "upsell": return <TrendingUp className="h-4 w-4 text-purple-500" />;
      default: return null;
    }
  };

  const typeBg = (type: string) => {
    switch (type) {
      case "strategy": return "bg-blue-50 border-blue-100";
      case "script": return "bg-green-50 border-green-100";
      case "risk": return "bg-amber-50 border-amber-100";
      case "upsell": return "bg-purple-50 border-purple-100";
      default: return "bg-gray-50 border-gray-100";
    }
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className={`rounded-lg border p-3 ${typeBg(item.type)}`}>
          <div className="flex items-center gap-2 mb-1">
            {typeIcon(item.type)}
            <span className="text-xs font-semibold uppercase text-gray-600">{item.type}</span>
          </div>
          <p className="text-sm font-medium text-gray-900">{item.title}</p>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{item.content}</p>
        </div>
      ))}
    </div>
  );
}

export default function LocationIntakePage() {
  const searchParams = useSearchParams();
  const [currentSection, setCurrentSection] = useState(0);
  const [values, setValues] = useState<FormValues>({
    machine_types: [],
    target_zips: [],
    target_cities: [],
    target_states: [],
    preferred_location_types: [],
    preferences: {},
    restrictions: {},
    has_business_license: false,
    has_insurance: false,
    has_w9: false,
    machine_count: 1,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [guidance, setGuidance] = useState<GuidanceItem[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; url: string }[]>([]);

  // Prefill from query params
  useEffect(() => {
    const dealId = searchParams.get("deal_id");
    const accountId = searchParams.get("account_id");
    const intakeId = searchParams.get("intake_lead_id");
    const name = searchParams.get("name");
    const email = searchParams.get("email");
    const phone = searchParams.get("phone");

    if (dealId || accountId || name) {
      setValues((prev) => ({
        ...prev,
        deal_id: dealId || "",
        account_id: accountId || "",
        intake_lead_id: intakeId || "",
        client_name: name || "",
        client_email: email || "",
        client_phone: phone || "",
      }));
    }
  }, [searchParams]);

  const updateField = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleArrayItem = (key: string, item: string) => {
    setValues((prev) => {
      const arr = (prev[key] as string[]) || [];
      return {
        ...prev,
        [key]: arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item],
      };
    });
  };

  // Guidance
  useEffect(() => {
    const section = SECTIONS[currentSection]?.id || "";
    const g = getGuidance({ form: "location-intake", section, values });
    setGuidance(g);
  }, [currentSection, values]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, fileType: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("file_type", fileType);
    if (values.account_id) formData.append("account_id", values.account_id as string);
    if (values.deal_id) formData.append("deal_id", values.deal_id as string);

    const res = await fetch("/api/intake/upload", { method: "POST", body: formData });
    if (res.ok) {
      const data = await res.json();
      setUploadedFiles((prev) => [...prev, { name: file.name, url: data.signed_url }]);
    }
    setUploadingFile(false);
  }

  async function handleSubmit() {
    if (!values.client_name) {
      setError("Client name is required.");
      return;
    }
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/intake/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (res.ok) {
      setSubmitted(true);
    } else {
      const data = await res.json();
      setError(data.error || "Something went wrong.");
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Location Request Submitted</h1>
          <p className="text-gray-600 mb-6">
            We&apos;ll begin scouting locations matching your criteria. You&apos;ll receive updates by email.
          </p>
        </div>
      </div>
    );
  }

  const section = SECTIONS[currentSection];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto flex">
        {/* Main form */}
        <div className="flex-1 max-w-3xl px-6 py-10">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold text-gray-900">Location Services Intake</h1>
              <span className="text-sm text-gray-400">
                Step {currentSection + 1} of {SECTIONS.length}
              </span>
            </div>
            <div className="h-1 w-full rounded-full bg-gray-100">
              <div
                className="h-1 rounded-full bg-black transition-all"
                style={{ width: `${((currentSection + 1) / SECTIONS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Section pills */}
          <div className="flex flex-wrap gap-1 mb-8">
            {SECTIONS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setCurrentSection(i)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  i === currentSection
                    ? "bg-black text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <s.icon className="h-3 w-3" />
                {s.label}
              </button>
            ))}
          </div>

          {/* Sections */}
          <div className="space-y-6">
            {section.id === "client_info" && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Client Information</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Client Name *</label>
                    <input
                      type="text"
                      value={(values.client_name as string) || ""}
                      onChange={(e) => updateField("client_name", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={(values.client_email as string) || ""}
                      onChange={(e) => updateField("client_email", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={(values.client_phone as string) || ""}
                      onChange={(e) => updateField("client_phone", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            {section.id === "placement_details" && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Placement Details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Number of Machines</label>
                    <input
                      type="number"
                      min={1}
                      value={(values.machine_count as number) || 1}
                      onChange={(e) => updateField("machine_count", Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Placement Timeline</label>
                    <select
                      value={(values.placement_timeline as string) || ""}
                      onChange={(e) => updateField("placement_timeline", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none cursor-pointer"
                    >
                      <option value="">Select...</option>
                      <option value="asap">ASAP</option>
                      <option value="2_weeks">Within 2 Weeks</option>
                      <option value="1_month">Within 1 Month</option>
                      <option value="flexible">Flexible</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Machine Types</label>
                  <div className="flex flex-wrap gap-2">
                    {MACHINE_TYPES.map((mt) => {
                      const selected = (values.machine_types as string[])?.includes(mt.value);
                      return (
                        <button
                          key={mt.value}
                          onClick={() => toggleArrayItem("machine_types", mt.value)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                            selected
                              ? "border-black bg-black text-white"
                              : "border-gray-200 text-gray-600 hover:border-gray-400"
                          }`}
                        >
                          {mt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target ZIP Codes</label>
                  <input
                    type="text"
                    value={((values.target_zips as string[]) || []).join(", ")}
                    onChange={(e) =>
                      updateField("target_zips", e.target.value.split(",").map((z) => z.trim()).filter(Boolean))
                    }
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                    placeholder="75001, 75002, 75003"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Cities</label>
                  <input
                    type="text"
                    value={((values.target_cities as string[]) || []).join(", ")}
                    onChange={(e) =>
                      updateField("target_cities", e.target.value.split(",").map((c) => c.trim()).filter(Boolean))
                    }
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                    placeholder="Dallas, Fort Worth, Arlington"
                  />
                </div>
              </>
            )}

            {section.id === "location_profile" && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Location Profile</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Location Types</label>
                  <div className="grid grid-cols-2 gap-2">
                    {LOCATION_TYPES.map((lt) => {
                      const selected = (values.preferred_location_types as string[])?.includes(lt.value);
                      return (
                        <button
                          key={lt.value}
                          onClick={() => toggleArrayItem("preferred_location_types", lt.value)}
                          className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors cursor-pointer text-left ${
                            selected
                              ? "border-black bg-black text-white"
                              : "border-gray-200 text-gray-700 hover:border-gray-400"
                          }`}
                        >
                          {lt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Foot Traffic (daily)</label>
                    <input
                      type="number"
                      value={(values.min_foot_traffic as number) || ""}
                      onChange={(e) => updateField("min_foot_traffic", Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                      placeholder="e.g. 100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Commission Rate (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={(values.max_commission_rate as number) || ""}
                      onChange={(e) => updateField("max_commission_rate", Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                      placeholder="e.g. 20"
                    />
                  </div>
                </div>
              </>
            )}

            {section.id === "restrictions" && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Preferences & Restrictions</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Product Preferences</label>
                    <textarea
                      value={(values.preferences as Record<string, string>)?.products || ""}
                      onChange={(e) => updateField("preferences", { ...(values.preferences as object), products: e.target.value })}
                      rows={2}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none resize-none"
                      placeholder="Specific brands, product types, dietary options..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location Restrictions</label>
                    <textarea
                      value={(values.restrictions as Record<string, string>)?.location || ""}
                      onChange={(e) => updateField("restrictions", { ...(values.restrictions as object), location: e.target.value })}
                      rows={2}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none resize-none"
                      placeholder="Areas to avoid, competitors nearby, accessibility requirements..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Other Restrictions</label>
                    <textarea
                      value={(values.restrictions as Record<string, string>)?.other || ""}
                      onChange={(e) => updateField("restrictions", { ...(values.restrictions as object), other: e.target.value })}
                      rows={2}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none resize-none"
                      placeholder="Hours of operation, contract terms, etc."
                    />
                  </div>
                </div>
              </>
            )}

            {section.id === "expectations" && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Budget & Expectations</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Budget for Placement ($)</label>
                    <input
                      type="number"
                      value={(values.budget as number) || ""}
                      onChange={(e) => updateField("budget", Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                      placeholder="e.g. 5000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expected Monthly Revenue ($)</label>
                    <input
                      type="number"
                      value={(values.expected_monthly_revenue as number) || ""}
                      onChange={(e) => updateField("expected_monthly_revenue", Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                      placeholder="e.g. 2000"
                    />
                  </div>
                </div>
              </>
            )}

            {section.id === "agreement_prep" && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Agreement Preparation</h2>
                <p className="text-sm text-gray-500 mb-4">The following documents are required for placement:</p>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(values.has_business_license as boolean) || false}
                      onChange={(e) => updateField("has_business_license", e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">I have a valid business license</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(values.has_insurance as boolean) || false}
                      onChange={(e) => updateField("has_insurance", e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">I have general liability insurance</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(values.has_w9 as boolean) || false}
                      onChange={(e) => updateField("has_w9", e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">I have a completed W9</span>
                  </label>
                </div>

                {/* File uploads */}
                <div className="mt-6 space-y-3">
                  <p className="text-sm font-medium text-gray-700">Upload Documents</p>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">
                      <Upload className="h-4 w-4" />
                      Upload W9 / ID / License
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        onChange={(e) => handleFileUpload(e, "w9")}
                      />
                    </label>
                    {uploadingFile && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                  </div>
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-1">
                      {uploadedFiles.map((f, i) => (
                        <p key={i} className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {f.name}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes for Agreement</label>
                  <textarea
                    value={(values.agreement_notes as string) || ""}
                    onChange={(e) => updateField("agreement_notes", e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none resize-none"
                    placeholder="Any special terms or conditions..."
                  />
                </div>
              </>
            )}

            {section.id === "confirmation" && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Review & Confirm</h2>
                <div className="rounded-lg border border-gray-200 p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Client</p>
                      <p className="font-medium text-gray-900">{(values.client_name as string) || "—"}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Machines</p>
                      <p className="font-medium text-gray-900">{(values.machine_count as number) || 1}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Machine Types</p>
                      <p className="font-medium text-gray-900">
                        {((values.machine_types as string[]) || []).join(", ") || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Target Areas</p>
                      <p className="font-medium text-gray-900">
                        {[...((values.target_cities as string[]) || []), ...((values.target_zips as string[]) || [])].join(", ") || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Location Types</p>
                      <p className="font-medium text-gray-900">
                        {((values.preferred_location_types as string[]) || []).join(", ") || "Any"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Budget</p>
                      <p className="font-medium text-gray-900">
                        {(values.budget as number) ? `$${(values.budget as number).toLocaleString()}` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Documents</p>
                      <p className="font-medium text-gray-900">
                        {[
                          values.has_w9 && "W9",
                          values.has_insurance && "Insurance",
                          values.has_business_license && "License",
                        ].filter(Boolean).join(", ") || "None"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Uploaded Files</p>
                      <p className="font-medium text-gray-900">{uploadedFiles.length} file(s)</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
            <button
              onClick={() => setCurrentSection(Math.max(0, currentSection - 1))}
              disabled={currentSection === 0}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              Back
            </button>

            {currentSection < SECTIONS.length - 1 ? (
              <button
                onClick={() => setCurrentSection(currentSection + 1)}
                className="flex items-center gap-1 rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 cursor-pointer"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-black px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {submitting ? "Submitting..." : "Submit Location Request"}
              </button>
            )}
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> {error}
            </p>
          )}
        </div>

        {/* SOP Guidance Sidebar */}
        <aside className="hidden xl:block w-80 border-l border-gray-100 p-6 sticky top-0 h-screen overflow-y-auto">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Placement Guidance
          </h3>
          <GuidanceSidebar items={guidance} />
          {guidance.length === 0 && (
            <p className="text-sm text-gray-300">Fill in fields to see contextual guidance.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
