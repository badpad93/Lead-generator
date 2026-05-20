"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, ExternalLink, CheckCircle2, AlertCircle, Zap } from "lucide-react";

const INDUSTRIES = [
  "warehouses",
  "manufacturing",
  "logistics",
  "distribution centers",
  "auto dealerships",
  "collision centers",
  "office buildings",
  "medical offices",
  "private schools",
  "vending operators",
  "hotels",
  "apartments",
  "tire shops",
  "truck repair shops",
  "rehabs",
  "RV parks",
  "motorcycle dealerships",
  "motorcycle repair shops",
  "electrical supply stores",
  "vocational schools",
  "universities",
  "cosmetology schools",
  "trucking schools",
  "nursing schools",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

interface SalesUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function LeadGeneratorPage() {
  const [token, setToken] = useState("");
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([]);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ sheet_url: string; lead_count: number; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    city: "",
    state: "",
    industry: "",
    radius: "25",
    lead_count: "40",
    assigned_to: "",
    list_name: "",
  });

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) return;
      setToken(session.access_token);
      const res = await fetch("/api/sales/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setSalesUsers(await res.json());
    });
  }, []);

  async function handleGenerate() {
    if (!form.city.trim()) { setError("City is required"); return; }
    if (!form.state) { setError("State is required"); return; }
    if (!form.industry) { setError("Industry is required"); return; }

    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/sales/lead-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          city: form.city.trim(),
          state: form.state,
          industry: form.industry,
          radius: Number(form.radius) || 25,
          lead_count: Number(form.lead_count) || 40,
          assigned_to: form.assigned_to || null,
          list_name: form.list_name.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate leads");
        return;
      }

      setResult({ sheet_url: data.sheet_url, lead_count: data.lead_count, title: data.title });
      setForm({ city: "", state: "", industry: "", radius: "25", lead_count: "40", assigned_to: "", list_name: "" });
    } catch {
      setError("Network error — please try again");
    } finally {
      setGenerating(false);
    }
  }

  const inputClass = "w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600/30";
  const selectClass = `${inputClass} cursor-pointer`;
  const labelClass = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-green-100">
          <Zap className="w-5 h-5 text-green-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Generator</h1>
          <p className="text-sm text-gray-500">Auto-generate outbound call lists from Google Places</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-800">{result.lead_count} leads generated</p>
              <p className="text-sm text-green-700 mt-1">Sheet: {result.title}</p>
              <a
                href={result.sheet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Open Google Sheet
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>City <span className="text-red-500">*</span></label>
            <input
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              placeholder="e.g. Detroit"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>State <span className="text-red-500">*</span></label>
            <select
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              className={selectClass}
            >
              <option value="">Select state...</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Industry <span className="text-red-500">*</span></label>
          <select
            value={form.industry}
            onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
            className={selectClass}
          >
            <option value="">Select industry...</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Radius (miles)</label>
            <input
              type="number"
              value={form.radius}
              onChange={(e) => setForm((f) => ({ ...f, radius: e.target.value }))}
              placeholder="25"
              min="1"
              max="100"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Max Leads</label>
            <input
              type="number"
              value={form.lead_count}
              onChange={(e) => setForm((f) => ({ ...f, lead_count: e.target.value }))}
              placeholder="40"
              min="5"
              max="60"
              className={inputClass}
            />
            <p className="text-[10px] text-gray-400 mt-1">Max 60 per generation</p>
          </div>
        </div>

        <div>
          <label className={labelClass}>Assign to Rep</label>
          <select
            value={form.assigned_to}
            onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
            className={selectClass}
          >
            <option value="">Unassigned</option>
            {salesUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>List Name</label>
          <input
            value={form.list_name}
            onChange={(e) => setForm((f) => ({ ...f, list_name: e.target.value }))}
            placeholder="Auto-generated if blank (e.g. Detroit_Warehouses_Leads)"
            className={inputClass}
          />
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="w-full py-3 px-4 bg-green-700 hover:bg-green-800 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating leads...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Generate Call List
            </>
          )}
        </button>

        {generating && (
          <p className="text-xs text-center text-gray-500">
            Searching Google Places and creating your spreadsheet. This may take 15-30 seconds.
          </p>
        )}
      </div>
    </div>
  );
}
