"use client";

import { Trash2, Plus } from "lucide-react";
import { TextField, TextArea, ChipToggle } from "./fields";
import type { StepProps } from "./types";

const SERVICES = [
  { value: "ai_vending", label: "AI Vending" },
  { value: "traditional_vending", label: "Traditional Vending" },
  { value: "micro_markets", label: "Micro Markets" },
  { value: "office_coffee", label: "Office Coffee Service" },
  { value: "pantry", label: "Pantry Service" },
  { value: "healthy_vending", label: "Healthy Vending" },
  { value: "beverage", label: "Beverage Service" },
  { value: "custom", label: "Custom / Other" },
];

const INDUSTRIES = [
  { value: "offices", label: "Offices" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "warehouses", label: "Warehouses" },
  { value: "healthcare", label: "Healthcare" },
  { value: "schools", label: "Schools" },
  { value: "apartments", label: "Apartments" },
  { value: "hotels", label: "Hotels" },
  { value: "gyms", label: "Gyms" },
  { value: "auto_dealerships", label: "Auto Dealerships" },
  { value: "government", label: "Government" },
  { value: "retail", label: "Retail" },
  { value: "other", label: "Other" },
];

/**
 * Step 3 — Products, Services & Target Customer. Consolidated per spec:
 * services + revenue drivers + differentiators + industries + geography
 * in one logical block.
 */
export default function WizardProductsStep({ request, updateField, isReadOnly }: StepProps) {
  const selectedServices = request.primary_services || [];
  const selectedIndustries = request.industries_served || [];
  const drivers = request.revenue_drivers || [];
  const geo = request.geographic_market || {};

  function updateGeo(patch: Partial<typeof geo>) {
    updateField("geographic_market", { ...geo, ...patch });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Products, Services &amp; Target Customer</h2>
        <p className="text-sm text-gray-500 mt-1">
          What you offer, what makes you win, and who you serve.
        </p>
      </div>

      <ChipToggle
        label="Primary Services"
        options={SERVICES}
        selected={selectedServices}
        onChange={(next) => updateField("primary_services", next)}
        disabled={isReadOnly}
      />
      {selectedServices.includes("custom") && (
        <TextField
          label="Describe your custom service"
          value={request.primary_services_other}
          onChange={(v) => updateField("primary_services_other", v)}
          disabled={isReadOnly}
        />
      )}

      {/* Revenue drivers */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Top 3 Revenue Drivers</label>
        <p className="text-[11px] text-gray-500 mb-2">The services/products that bring in most of your revenue.</p>
        <div className="space-y-3">
          {drivers.map((d, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={d.name}
                  onChange={(e) => {
                    const next = [...drivers];
                    next[i] = { ...next[i], name: e.target.value };
                    updateField("revenue_drivers", next);
                  }}
                  placeholder="Product / service name"
                  disabled={isReadOnly}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white disabled:bg-gray-100"
                />
                <input
                  type="text"
                  value={d.pricing || ""}
                  onChange={(e) => {
                    const next = [...drivers];
                    next[i] = { ...next[i], pricing: e.target.value };
                    updateField("revenue_drivers", next);
                  }}
                  placeholder="Pricing (optional)"
                  disabled={isReadOnly}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white disabled:bg-gray-100"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={d.description || ""}
                  onChange={(e) => {
                    const next = [...drivers];
                    next[i] = { ...next[i], description: e.target.value };
                    updateField("revenue_drivers", next);
                  }}
                  placeholder="Short description"
                  disabled={isReadOnly}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white disabled:bg-gray-100"
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => updateField("revenue_drivers", drivers.filter((_, x) => x !== i))}
                    className="rounded-lg p-2 text-gray-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {!isReadOnly && drivers.length < 5 && (
            <button
              type="button"
              onClick={() => updateField("revenue_drivers", [...drivers, { name: "", description: "", pricing: "" }])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add Revenue Driver
            </button>
          )}
        </div>
      </div>

      <TextArea label="Pricing Notes" value={request.pricing_notes} onChange={(v) => updateField("pricing_notes", v)} disabled={isReadOnly} rows={3} placeholder="Anything specific about how you price?" />

      <TextArea label="Why Customers Choose You" value={request.differentiators} onChange={(v) => updateField("differentiators", v)} disabled={isReadOnly} rows={3} placeholder="Your key differentiators / value proposition." />

      <ChipToggle
        label="Industries Served"
        options={INDUSTRIES}
        selected={selectedIndustries}
        onChange={(next) => updateField("industries_served", next)}
        disabled={isReadOnly}
      />
      {selectedIndustries.includes("other") && (
        <TextField
          label="Describe other industries"
          value={request.industries_served_other}
          onChange={(v) => updateField("industries_served_other", v)}
          disabled={isReadOnly}
        />
      )}

      {/* Geographic market */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Primary Geographic Market</label>
        <p className="text-[11px] text-gray-500 mb-2">Where you serve — comma-separate multiple values in each field.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            value={(geo.cities || []).join(", ")}
            onChange={(e) => updateGeo({ cities: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            placeholder="Cities (e.g. Denver, Aurora)"
            disabled={isReadOnly}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white disabled:bg-gray-50"
          />
          <input
            type="text"
            value={(geo.states || []).join(", ")}
            onChange={(e) => updateGeo({ states: e.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) })}
            placeholder="States (e.g. CO, WY)"
            disabled={isReadOnly}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white disabled:bg-gray-50"
          />
          <input
            type="text"
            value={(geo.counties || []).join(", ")}
            onChange={(e) => updateGeo({ counties: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            placeholder="Counties / regions (optional)"
            disabled={isReadOnly}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white disabled:bg-gray-50"
          />
          <input
            type="number"
            value={geo.radius_miles ?? ""}
            onChange={(e) => updateGeo({ radius_miles: e.target.value ? Number(e.target.value) : null })}
            placeholder="Service radius (miles)"
            disabled={isReadOnly}
            min={0}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white disabled:bg-gray-50"
          />
        </div>
      </div>
    </div>
  );
}
