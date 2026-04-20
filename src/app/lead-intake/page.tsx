"use client";

import { useState, useEffect, useCallback } from "react";
import { getGuidance, GuidanceItem } from "@/lib/sopGuidance";
import { scoreDeal, DealScores, getScoreLabel, getScoreColor } from "@/lib/dealScoring";
import {
  User,
  Building2,
  Briefcase,
  MapPin,
  DollarSign,
  Shield,
  FileText,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Lightbulb,
  MessageSquare,
  TrendingUp,
  ChevronRight,
} from "lucide-react";

const SERVICES = [
  { value: "location", label: "Location Services" },
  { value: "machine", label: "Machines" },
  { value: "financing", label: "Financing" },
  { value: "digital", label: "Web / SEO" },
  { value: "advertising", label: "Advertising" },
  { value: "coffee", label: "Coffee Service" },
  { value: "llc_compliance", label: "LLC & Compliance" },
  { value: "total_operator_package", label: "Total Operator Package" },
];

const BUDGET_OPTIONS = [
  { value: "under_5k", label: "Under $5,000" },
  { value: "5k_15k", label: "$5,000 – $15,000" },
  { value: "15k_30k", label: "$15,000 – $30,000" },
  { value: "30k_50k", label: "$30,000 – $50,000" },
  { value: "50k_plus", label: "$50,000+" },
];

const TIMELINE_OPTIONS = [
  { value: "immediately", label: "Immediately" },
  { value: "1_2_weeks", label: "1–2 Weeks" },
  { value: "1_month", label: "Within 1 Month" },
  { value: "1_3_months", label: "1–3 Months" },
  { value: "no_rush", label: "No Rush" },
  { value: "exploring", label: "Just Exploring" },
];

const BUSINESS_TYPES = [
  { value: "startup", label: "Startup / New Operator" },
  { value: "existing_operator", label: "Existing Vending Operator" },
  { value: "franchise", label: "Franchise" },
  { value: "location_owner", label: "Location / Property Owner" },
  { value: "investor", label: "Investor" },
  { value: "other", label: "Other" },
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
  { id: "basic_info", label: "Basic Info", icon: User },
  { id: "business_profile", label: "Business Profile", icon: Building2 },
  { id: "current_status", label: "Current Status", icon: Briefcase },
  { id: "services_needed", label: "Services", icon: FileText },
  { id: "location_requirements", label: "Location Details", icon: MapPin },
  { id: "budget_timeline", label: "Budget & Timeline", icon: DollarSign },
  { id: "decision_authority", label: "Decision Authority", icon: Shield },
  { id: "notes", label: "Notes", icon: MessageSquare },
];

type FormValues = Record<string, unknown>;

function GuidancePanel({ items, score }: { items: GuidanceItem[]; score?: DealScores }) {
  if (items.length === 0 && !score) return null;

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
      {score && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">LIVE DEAL SCORE</p>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${getScoreColor(score.deal_quality_score)}`}>
              {score.deal_quality_score}
            </span>
            <span className="text-sm text-gray-500">/ 100</span>
            <span className={`ml-auto text-sm font-medium ${getScoreColor(score.deal_quality_score)}`}>
              {getScoreLabel(score.deal_quality_score)}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-gray-400">Intent</span> <span className="font-medium ml-1">{score.intent_score}</span></div>
            <div><span className="text-gray-400">Budget</span> <span className="font-medium ml-1">{score.budget_score}</span></div>
            <div><span className="text-gray-400">Ready</span> <span className="font-medium ml-1">{score.readiness_score}</span></div>
            <div><span className="text-gray-400">Upsell</span> <span className="font-medium ml-1">{score.upsell_score}</span></div>
          </div>
        </div>
      )}
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

export default function LeadIntakePage() {
  const [currentSection, setCurrentSection] = useState(0);
  const [values, setValues] = useState<FormValues>({
    services_needed: [],
    target_states: [],
    target_zips: [],
    location_types_preferred: [],
    is_decision_maker: true,
    has_vending_currently: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [guidance, setGuidance] = useState<GuidanceItem[]>([]);
  const [scores, setScores] = useState<DealScores | null>(null);

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

  // Live scoring
  useEffect(() => {
    const s = scoreDeal({
      services_needed: values.services_needed as string[],
      budget_range: values.budget_range as string,
      timeline: values.timeline as string,
      is_decision_maker: values.is_decision_maker as boolean,
      has_vending_currently: values.has_vending_currently as boolean,
      num_locations_needed: values.num_locations_needed as number,
      years_in_business: values.years_in_business as string,
      annual_revenue: values.annual_revenue as string,
      referral_source: values.referral_source as string,
      num_employees: values.num_employees as string,
      pain_points: values.pain_points as string,
    });
    setScores(s);
  }, [values]);

  // Live guidance
  useEffect(() => {
    const section = SECTIONS[currentSection]?.id || "";
    const g = getGuidance({
      form: "lead-intake",
      section,
      values,
      score: scores?.deal_quality_score,
    });
    setGuidance(g);
  }, [currentSection, values, scores]);

  async function handleSubmit() {
    if (!values.full_name || !values.email) {
      setError("Name and email are required.");
      return;
    }
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/intake", {
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Form Submitted</h1>
          <p className="text-gray-600 mb-6">
            Thank you, {values.full_name as string}. A sales representative will contact you within 1 business day.
          </p>
          <p className="text-sm text-gray-400">
            A confirmation email has been sent to {values.email as string}.
          </p>
        </div>
      </div>
    );
  }

  const section = SECTIONS[currentSection];
  const showLocationSection = (values.services_needed as string[])?.includes("location");

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto flex">
        {/* Main form area */}
        <div className="flex-1 max-w-3xl px-6 py-10">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold text-gray-900">Sales Intake</h1>
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

          {/* Section nav pills */}
          <div className="flex flex-wrap gap-1 mb-8">
            {SECTIONS.map((s, i) => {
              if (s.id === "location_requirements" && !showLocationSection) return null;
              return (
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
              );
            })}
          </div>

          {/* Form sections */}
          <div className="space-y-6">
            {section.id === "basic_info" && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      value={(values.full_name as string) || ""}
                      onChange={(e) => updateField("full_name", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                      placeholder="John Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
                    <input
                      type="text"
                      value={(values.business_name as string) || ""}
                      onChange={(e) => updateField("business_name", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                      placeholder="Acme Vending LLC"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      value={(values.email as string) || ""}
                      onChange={(e) => updateField("email", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                      placeholder="john@acmevending.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={(values.phone as string) || ""}
                      onChange={(e) => updateField("phone", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">How did you hear about us?</label>
                  <select
                    value={(values.referral_source as string) || ""}
                    onChange={(e) => updateField("referral_source", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none cursor-pointer"
                  >
                    <option value="">Select...</option>
                    <option value="google">Google Search</option>
                    <option value="referral">Referral</option>
                    <option value="social">Social Media</option>
                    <option value="partner">Partner</option>
                    <option value="event">Event / Trade Show</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </>
            )}

            {section.id === "business_profile" && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Business Profile</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Business Type</label>
                    <select
                      value={(values.business_type as string) || ""}
                      onChange={(e) => updateField("business_type", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none cursor-pointer"
                    >
                      <option value="">Select...</option>
                      {BUSINESS_TYPES.map((bt) => (
                        <option key={bt.value} value={bt.value}>{bt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Years in Business</label>
                    <select
                      value={(values.years_in_business as string) || ""}
                      onChange={(e) => updateField("years_in_business", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none cursor-pointer"
                    >
                      <option value="">Select...</option>
                      <option value="startup">Startup / Pre-launch</option>
                      <option value="under_1">Less than 1 year</option>
                      <option value="1_3">1–3 years</option>
                      <option value="3_5">3–5 years</option>
                      <option value="5_plus">5+ years</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Number of Employees</label>
                    <select
                      value={(values.num_employees as string) || ""}
                      onChange={(e) => updateField("num_employees", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none cursor-pointer"
                    >
                      <option value="">Select...</option>
                      <option value="solo">Just me</option>
                      <option value="2_5">2–5</option>
                      <option value="6_20">6–20</option>
                      <option value="20_50">20–50</option>
                      <option value="50_plus">50+</option>
                      <option value="100_plus">100+</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Annual Revenue</label>
                    <select
                      value={(values.annual_revenue as string) || ""}
                      onChange={(e) => updateField("annual_revenue", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none cursor-pointer"
                    >
                      <option value="">Select...</option>
                      <option value="under_100k">Under $100k</option>
                      <option value="100k_500k">$100k – $500k</option>
                      <option value="500k_1m">$500k – $1M</option>
                      <option value="1m_5m">$1M – $5M</option>
                      <option value="5m_plus">$5M+</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {section.id === "current_status" && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Current Vending Status</h2>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="has_vending"
                      checked={(values.has_vending_currently as boolean) || false}
                      onChange={(e) => updateField("has_vending_currently", e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                    />
                    <label htmlFor="has_vending" className="text-sm text-gray-700 cursor-pointer">
                      I currently have vending operations
                    </label>
                  </div>
                  {(values.has_vending_currently as boolean) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Current Provider</label>
                      <input
                        type="text"
                        value={(values.current_provider as string) || ""}
                        onChange={(e) => updateField("current_provider", e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                        placeholder="Who do you currently work with?"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pain Points / Challenges</label>
                    <textarea
                      value={(values.pain_points as string) || ""}
                      onChange={(e) => updateField("pain_points", e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none resize-none"
                      placeholder="What problems are you trying to solve?"
                    />
                  </div>
                </div>
              </>
            )}

            {section.id === "services_needed" && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Services Needed</h2>
                <p className="text-sm text-gray-500 mb-3">Select all that apply:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SERVICES.map((svc) => {
                    const selected = (values.services_needed as string[])?.includes(svc.value);
                    return (
                      <button
                        key={svc.value}
                        onClick={() => toggleArrayItem("services_needed", svc.value)}
                        className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors cursor-pointer ${
                          selected
                            ? "border-black bg-black text-white"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
                        }`}
                      >
                        {selected && <CheckCircle2 className="h-4 w-4" />}
                        {svc.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {section.id === "location_requirements" && showLocationSection && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Location Requirements</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Number of Locations Needed</label>
                    <input
                      type="number"
                      min={1}
                      value={(values.num_locations_needed as number) || ""}
                      onChange={(e) => updateField("num_locations_needed", Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                      placeholder="e.g. 3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Foot Traffic Estimate</label>
                    <select
                      value={(values.foot_traffic_estimate as string) || ""}
                      onChange={(e) => updateField("foot_traffic_estimate", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none cursor-pointer"
                    >
                      <option value="">Select...</option>
                      <option value="under_50">Under 50/day</option>
                      <option value="50_100">50–100/day</option>
                      <option value="100_300">100–300/day</option>
                      <option value="300_plus">300+/day</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Location Types</label>
                  <div className="flex flex-wrap gap-2">
                    {LOCATION_TYPES.map((lt) => {
                      const selected = (values.location_types_preferred as string[])?.includes(lt.value);
                      return (
                        <button
                          key={lt.value}
                          onClick={() => toggleArrayItem("location_types_preferred", lt.value)}
                          className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors cursor-pointer ${
                            selected
                              ? "border-black bg-black text-white"
                              : "border-gray-200 text-gray-600 hover:border-gray-400"
                          }`}
                        >
                          {lt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target ZIP Codes (comma separated)</label>
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
              </>
            )}

            {section.id === "budget_timeline" && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Budget & Timeline</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Budget Range</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {BUDGET_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => updateField("budget_range", opt.value)}
                          className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                            values.budget_range === opt.value
                              ? "border-black bg-black text-white"
                              : "border-gray-200 text-gray-700 hover:border-gray-400"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Timeline</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {TIMELINE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => updateField("timeline", opt.value)}
                          className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                            values.timeline === opt.value
                              ? "border-black bg-black text-white"
                              : "border-gray-200 text-gray-700 hover:border-gray-400"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {section.id === "decision_authority" && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Decision Authority</h2>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="is_dm"
                      checked={(values.is_decision_maker as boolean)}
                      onChange={(e) => updateField("is_decision_maker", e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                    />
                    <label htmlFor="is_dm" className="text-sm text-gray-700 cursor-pointer">
                      I am the decision maker
                    </label>
                  </div>
                  {!values.is_decision_maker && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Decision Maker Name</label>
                        <input
                          type="text"
                          value={(values.decision_maker_name as string) || ""}
                          onChange={(e) => updateField("decision_maker_name", e.target.value)}
                          className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Their Title</label>
                        <input
                          type="text"
                          value={(values.decision_maker_title as string) || ""}
                          onChange={(e) => updateField("decision_maker_title", e.target.value)}
                          className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Decision Timeline</label>
                    <select
                      value={(values.decision_timeline as string) || ""}
                      onChange={(e) => updateField("decision_timeline", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none cursor-pointer"
                    >
                      <option value="">Select...</option>
                      <option value="today">Can decide today</option>
                      <option value="this_week">This week</option>
                      <option value="needs_approval">Needs internal approval</option>
                      <option value="committee">Committee decision</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {section.id === "notes" && (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Additional Notes</h2>
                <textarea
                  value={(values.notes as string) || ""}
                  onChange={(e) => updateField("notes", e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-black focus:outline-none resize-none"
                  placeholder="Anything else we should know? Special requirements, questions, context..."
                />
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
                onClick={() => {
                  let next = currentSection + 1;
                  if (SECTIONS[next].id === "location_requirements" && !showLocationSection) next++;
                  setCurrentSection(next);
                }}
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
                {submitting ? "Submitting..." : "Submit Intake"}
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
            Sales Guidance
          </h3>
          <GuidancePanel items={guidance} score={scores || undefined} />
          {guidance.length === 0 && !scores && (
            <p className="text-sm text-gray-300">Fill in fields to see contextual guidance.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
