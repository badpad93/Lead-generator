"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Crosshair,
  Factory,
  Rocket,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

const INDUSTRIES = [
  "Apartments",
  "Hotels",
  "Hospitals",
  "Assisted Living",
  "Nursing Homes",
  "Gyms",
  "Office Space",
  "School Campuses",
  "Warehouses",
  "Distribution Centers",
  "Manufacturing Plants",
  "Car Dealerships",
  "Car Service Stations",
  "Car Washes",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
  "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY",
];

const INDUSTRY_ICONS: Record<string, string> = {
  Apartments: "🏢",
  Hotels: "🏨",
  Hospitals: "🏥",
  "Assisted Living": "🏠",
  "Nursing Homes": "👴",
  Gyms: "💪",
  "Office Space": "🏬",
  "School Campuses": "🎓",
  Warehouses: "📦",
  "Distribution Centers": "🚚",
  "Manufacturing Plants": "🏭",
  "Car Dealerships": "🚗",
  "Car Service Stations": "🔧",
  "Car Washes": "🚿",
};

export default function NewRunPage() {
  const router = useRouter();
  const [city, setCity] = useState("Denver");
  const [state, setState] = useState("CO");
  const [radius, setRadius] = useState(50);
  const [maxLeads, setMaxLeads] = useState(500);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleIndustry(ind: string) {
    setSelected((prev) =>
      prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind]
    );
  }

  function selectAll() {
    setSelected(selected.length === INDUSTRIES.length ? [] : [...INDUSTRIES]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!city.trim()) {
      setError("City is required");
      return;
    }
    if (selected.length === 0) {
      setError("Select at least one industry");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: city.trim(),
          state,
          radius,
          maxLeads,
          industries: selected,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : JSON.stringify(data.error)
        );
        return;
      }

      router.push(`/runs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Create New Run</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure your search parameters and select target industries.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Location Section */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-blue-50 rounded-lg">
              <MapPin className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900">Location</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                placeholder="e.g. Denver"
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                State
              </label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="text-sm"
              >
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Search Parameters */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-violet-50 rounded-lg">
              <Crosshair className="w-4 h-4 text-violet-600" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900">
              Search Parameters
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Search Radius
              </label>
              <div className="space-y-2">
                <input
                  type="range"
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  min={1}
                  max={200}
                />
                <div className="flex justify-between text-xs text-slate-400">
                  <span>1 mi</span>
                  <span className="font-semibold text-sm text-slate-900">
                    {radius} miles
                  </span>
                  <span>200 mi</span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Max Leads
              </label>
              <input
                type="number"
                value={maxLeads}
                onChange={(e) => setMaxLeads(Number(e.target.value))}
                min={1}
                max={5000}
                className="text-sm"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Between 1 and 5,000 leads per run
              </p>
            </div>
          </div>
        </div>

        {/* Industry Selection */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-50 rounded-lg">
                <Factory className="w-4 h-4 text-amber-600" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900">
                Industries
              </h2>
              <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[11px] font-medium text-slate-600">
                {selected.length} of {INDUSTRIES.length}
              </span>
            </div>
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              {selected.length === INDUSTRIES.length
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {INDUSTRIES.map((ind) => {
              const isSelected = selected.includes(ind);
              return (
                <button
                  key={ind}
                  type="button"
                  onClick={() => toggleIndustry(ind)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                    isSelected
                      ? "bg-blue-50 border-blue-200 text-blue-800 shadow-sm"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  <span className="text-base">{INDUSTRY_ICONS[ind]}</span>
                  <span className="font-medium flex-1">{ind}</span>
                  {isSelected && (
                    <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              Creating Run...
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4" />
              Create Run
            </>
          )}
        </button>
      </form>
    </div>
  );
}
