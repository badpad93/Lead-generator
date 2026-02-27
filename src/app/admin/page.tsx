"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Building2,
  MapPin,
  Route,
  Plus,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { MACHINE_TYPES, LOCATION_TYPES, URGENCY_OPTIONS, US_STATES } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Tab = "operators" | "locations" | "routes";

/* ------------------------------------------------------------------ */
/*  Multi-select toggle helper                                         */
/* ------------------------------------------------------------------ */

function toggle(arr: string[], val: string) {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

/* ------------------------------------------------------------------ */
/*  Toast                                                              */
/* ------------------------------------------------------------------ */

function Toast({
  message,
  type,
}: {
  message: string;
  type: "success" | "error";
}) {
  return (
    <div
      className={`toast ${type === "success" ? "toast-success" : "toast-error"}`}
    >
      <div className="flex items-center gap-2">
        {type === "success" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )}
        {message}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chip selector                                                      */
/* ------------------------------------------------------------------ */

function ChipSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-black-primary">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(toggle(selected, opt.value))}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              selected.includes(opt.value)
                ? "bg-green-primary text-white"
                : "bg-gray-100 text-black-primary/60 hover:bg-gray-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  State selector                                                     */
/* ------------------------------------------------------------------ */

function StateSelect({
  label,
  selected,
  onChange,
}: {
  label: string;
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-black-primary">
        {label}
      </label>
      <div className="flex flex-wrap gap-1">
        {US_STATES.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => onChange(toggle(selected, st))}
            className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
              selected.includes(st)
                ? "bg-green-primary text-white"
                : "bg-gray-100 text-black-primary/60 hover:bg-gray-200"
            }`}
          >
            {st}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Operator Listing Form                                              */
/* ------------------------------------------------------------------ */

function OperatorForm({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    machine_types: [] as string[],
    service_radius_miles: 50,
    cities_served: [] as string[],
    states_served: [] as string[],
    accepts_commission: true,
    min_daily_traffic: 0,
    machine_count_available: 1,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/operators", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
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

      onSuccess("Operator listing created!");
      setForm({
        title: "",
        description: "",
        machine_types: [],
        service_radius_miles: 50,
        cities_served: [],
        states_served: [],
        accepts_commission: true,
        min_daily_traffic: 0,
        machine_count_available: 1,
      });
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">
          Listing Title *
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Full-service vending operator in Denver metro"
          required
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">
          Description
        </label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          placeholder="Describe the operator's services..."
        />
      </div>

      <ChipSelect
        label="Machine Types *"
        options={MACHINE_TYPES}
        selected={form.machine_types}
        onChange={(val) => setForm((f) => ({ ...f, machine_types: val }))}
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            Machines Available
          </label>
          <input
            type="number"
            min={1}
            max={1000}
            value={form.machine_count_available}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                machine_count_available: parseInt(e.target.value) || 1,
              }))
            }
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            Service Radius (mi)
          </label>
          <input
            type="number"
            min={1}
            max={500}
            value={form.service_radius_miles}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                service_radius_miles: parseInt(e.target.value) || 50,
              }))
            }
          />
        </div>
      </div>

      <StateSelect
        label="States Served *"
        selected={form.states_served}
        onChange={(val) => setForm((f) => ({ ...f, states_served: val }))}
      />

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="accepts_commission"
          checked={form.accepts_commission}
          onChange={(e) =>
            setForm((f) => ({ ...f, accepts_commission: e.target.checked }))
          }
          className="h-4 w-4 rounded border-gray-300"
        />
        <label
          htmlFor="accepts_commission"
          className="text-sm text-black-primary"
        >
          Accepts commission-based arrangements
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50 cursor-pointer"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        Add Operator Listing
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Location Request Form                                              */
/* ------------------------------------------------------------------ */

function LocationForm({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    location_name: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    location_type: "office" as string,
    machine_types_wanted: [] as string[],
    estimated_daily_traffic: 0,
    commission_offered: false,
    commission_notes: "",
    urgency: "flexible" as string,
    contact_preference: "platform_message" as string,
    is_public: true,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...form,
        estimated_daily_traffic: form.estimated_daily_traffic || undefined,
        commission_notes: form.commission_notes || undefined,
        address: form.address || undefined,
        zip: form.zip || undefined,
        description: form.description || undefined,
      };

      const res = await fetch("/api/admin/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
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

      onSuccess("Location request created!");
      setForm({
        title: "",
        description: "",
        location_name: "",
        address: "",
        city: "",
        state: "",
        zip: "",
        location_type: "office",
        machine_types_wanted: [],
        estimated_daily_traffic: 0,
        commission_offered: false,
        commission_notes: "",
        urgency: "flexible",
        contact_preference: "platform_message",
        is_public: true,
      });
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">
          Request Title *
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Snack machine needed for office lobby"
          required
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">
          Location Name *
        </label>
        <input
          type="text"
          value={form.location_name}
          onChange={(e) =>
            setForm((f) => ({ ...f, location_name: e.target.value }))
          }
          placeholder="e.g. Apex Office Park Building A"
          required
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">
          Description
        </label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          placeholder="Describe the location and what you're looking for..."
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">
          Address
        </label>
        <input
          type="text"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          placeholder="123 Main St"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            City *
          </label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            State *
          </label>
          <select
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            required
          >
            <option value="">Select</option>
            {US_STATES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            ZIP
          </label>
          <input
            type="text"
            value={form.zip}
            onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
            maxLength={10}
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">
          Location Type *
        </label>
        <select
          value={form.location_type}
          onChange={(e) =>
            setForm((f) => ({ ...f, location_type: e.target.value }))
          }
        >
          {LOCATION_TYPES.map((lt) => (
            <option key={lt.value} value={lt.value}>
              {lt.label}
            </option>
          ))}
        </select>
      </div>

      <ChipSelect
        label="Machine Types Wanted *"
        options={MACHINE_TYPES}
        selected={form.machine_types_wanted}
        onChange={(val) =>
          setForm((f) => ({ ...f, machine_types_wanted: val }))
        }
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            Est. Daily Traffic
          </label>
          <input
            type="number"
            min={0}
            max={100000}
            value={form.estimated_daily_traffic}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                estimated_daily_traffic: parseInt(e.target.value) || 0,
              }))
            }
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            Urgency
          </label>
          <select
            value={form.urgency}
            onChange={(e) =>
              setForm((f) => ({ ...f, urgency: e.target.value }))
            }
          >
            {URGENCY_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="commission_offered"
          checked={form.commission_offered}
          onChange={(e) =>
            setForm((f) => ({ ...f, commission_offered: e.target.checked }))
          }
          className="h-4 w-4 rounded border-gray-300"
        />
        <label
          htmlFor="commission_offered"
          className="text-sm text-black-primary"
        >
          Commission offered to operator
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50 cursor-pointer"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        Add Location Request
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Route For Sale Form                                                */
/* ------------------------------------------------------------------ */

function RouteForm({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    city: "",
    state: "",
    num_machines: 1,
    num_locations: 1,
    monthly_revenue: 0,
    asking_price: 0,
    machine_types: [] as string[],
    location_types: [] as string[],
    includes_equipment: true,
    includes_contracts: true,
    contact_email: "",
    contact_phone: "",
    status: "active" as string,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...form,
        monthly_revenue: form.monthly_revenue || undefined,
        asking_price: form.asking_price || undefined,
        contact_email: form.contact_email || undefined,
        contact_phone: form.contact_phone || undefined,
      };

      const res = await fetch("/api/admin/routes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
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

      onSuccess("Route listing created!");
      setForm({
        title: "",
        description: "",
        city: "",
        state: "",
        num_machines: 1,
        num_locations: 1,
        monthly_revenue: 0,
        asking_price: 0,
        machine_types: [],
        location_types: [],
        includes_equipment: true,
        includes_contracts: true,
        contact_email: "",
        contact_phone: "",
        status: "active",
      });
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">
          Route Title *
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. 15-machine Denver metro route — $8k/mo revenue"
          required
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">
          Description
        </label>
        <textarea
          rows={4}
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          placeholder="Describe the route, locations, revenue history, reason for selling..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            City *
          </label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            State *
          </label>
          <select
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            required
          >
            <option value="">Select</option>
            {US_STATES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            Number of Machines *
          </label>
          <input
            type="number"
            min={1}
            value={form.num_machines}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                num_machines: parseInt(e.target.value) || 1,
              }))
            }
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            Number of Locations *
          </label>
          <input
            type="number"
            min={1}
            value={form.num_locations}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                num_locations: parseInt(e.target.value) || 1,
              }))
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            Monthly Revenue ($)
          </label>
          <input
            type="number"
            min={0}
            value={form.monthly_revenue}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                monthly_revenue: parseFloat(e.target.value) || 0,
              }))
            }
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            Asking Price ($)
          </label>
          <input
            type="number"
            min={0}
            value={form.asking_price}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                asking_price: parseFloat(e.target.value) || 0,
              }))
            }
          />
        </div>
      </div>

      <ChipSelect
        label="Machine Types *"
        options={MACHINE_TYPES}
        selected={form.machine_types}
        onChange={(val) => setForm((f) => ({ ...f, machine_types: val }))}
      />

      <ChipSelect
        label="Location Types"
        options={LOCATION_TYPES}
        selected={form.location_types}
        onChange={(val) => setForm((f) => ({ ...f, location_types: val }))}
      />

      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="includes_equipment"
            checked={form.includes_equipment}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                includes_equipment: e.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-gray-300"
          />
          <label
            htmlFor="includes_equipment"
            className="text-sm text-black-primary"
          >
            Includes equipment
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="includes_contracts"
            checked={form.includes_contracts}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                includes_contracts: e.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-gray-300"
          />
          <label
            htmlFor="includes_contracts"
            className="text-sm text-black-primary"
          >
            Includes location contracts
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            Contact Email
          </label>
          <input
            type="email"
            value={form.contact_email}
            onChange={(e) =>
              setForm((f) => ({ ...f, contact_email: e.target.value }))
            }
            placeholder="seller@example.com"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">
            Contact Phone
          </label>
          <input
            type="tel"
            value={form.contact_phone}
            onChange={(e) =>
              setForm((f) => ({ ...f, contact_phone: e.target.value }))
            }
            placeholder="(555) 123-4567"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50 cursor-pointer"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        Add Route Listing
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Admin Page                                                    */
/* ------------------------------------------------------------------ */

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("operators");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();

    async function checkAdmin() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login?redirect=/admin");
        return;
      }

      setToken(session.access_token);

      const res = await fetch("/api/admin/check", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();

      if (!data.isAdmin) {
        router.replace("/dashboard");
        return;
      }

      setIsAdmin(true);
      setLoading(false);
    }

    checkAdmin();
  }, [router]);

  function handleSuccess(msg: string) {
    setToast({ message: msg, type: "success" });
    setTimeout(() => setToast(null), 3000);
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-160px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-primary" />
      </div>
    );
  }

  if (!isAdmin || !token) return null;

  const tabs: { key: Tab; label: string; icon: typeof Building2 }[] = [
    { key: "operators", label: "Operator Listings", icon: Building2 },
    { key: "locations", label: "Location Requests", icon: MapPin },
    { key: "routes", label: "Routes For Sale", icon: Route },
  ];

  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50">
              <Shield className="h-6 w-6 text-green-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-black-primary">
                Admin Panel
              </h1>
              <p className="text-sm text-black-primary/50">
                Add listings, locations, and routes to the platform
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Tabs */}
        <div className="mb-8 flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === tab.key
                    ? "bg-green-primary text-white shadow-sm"
                    : "text-black-primary/60 hover:bg-gray-50 hover:text-black-primary"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Form Container */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-6 text-lg font-semibold text-black-primary">
            {activeTab === "operators" && "Add Operator Listing"}
            {activeTab === "locations" && "Add Location Request"}
            {activeTab === "routes" && "Add Route For Sale"}
          </h2>

          {activeTab === "operators" && (
            <OperatorForm token={token} onSuccess={handleSuccess} />
          )}
          {activeTab === "locations" && (
            <LocationForm token={token} onSuccess={handleSuccess} />
          )}
          {activeTab === "routes" && (
            <RouteForm token={token} onSuccess={handleSuccess} />
          )}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
