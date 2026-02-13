"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

export default function HomePage() {
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
          city,
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
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h1 className="text-2xl font-bold mb-1">New Lead Generation Run</h1>
        <p className="text-gray-500 mb-6 text-sm">
          Configure your search parameters and select target industries.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* City / State */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                placeholder="Denver"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">State</label>
              <select value={state} onChange={(e) => setState(e.target.value)}>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Radius / Max Leads */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Radius (miles)
              </label>
              <input
                type="number"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                min={1}
                max={200}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Max Leads
              </label>
              <input
                type="number"
                value={maxLeads}
                onChange={(e) => setMaxLeads(Number(e.target.value))}
                min={1}
                max={5000}
              />
            </div>
          </div>

          {/* Industries */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Industries</label>
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-blue-600 hover:underline"
              >
                {selected.length === INDUSTRIES.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {INDUSTRIES.map((ind) => (
                <label
                  key={ind}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                    selected.includes(ind)
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(ind)}
                    onChange={() => toggleIndustry(ind)}
                    className="accent-blue-600"
                  />
                  {ind}
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Creating Run..." : "Create Run"}
          </button>
        </form>
      </div>
    </div>
  );
}
