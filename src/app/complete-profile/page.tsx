"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Truck, Search, Building2, Briefcase } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { US_STATES } from "@/lib/types";

type AccountType = "operator" | "locator" | "location_manager" | "employee";

const ACCOUNT_TYPES: { value: AccountType; label: string; icon: typeof Truck; description: string }[] = [
  { value: "operator", label: "Operator", icon: Truck, description: "I own/operate vending machines" },
  { value: "locator", label: "Locator", icon: Search, description: "I find locations and sell leads" },
  { value: "location_manager", label: "Location Manager", icon: Building2, description: "I want a vending machine at my business" },
  { value: "employee", label: "Employee", icon: Briefcase, description: "I'm joining as a sales rep or team member" },
];

export default function CompleteProfilePage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [accountType, setAccountType] = useState<AccountType | "">("");
  const [form, setForm] = useState({
    full_name: "",
    company_name: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
  });

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        router.push("/login");
        return;
      }
      setToken(session.access_token);

      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const profile = await res.json();
          const hasRole = profile.role && !["operator"].includes(profile.role);
          if (hasRole && profile.phone && profile.address && profile.city && profile.state && profile.zip) {
            router.push("/dashboard");
            return;
          }
          if (profile.role && ["operator", "locator", "location_manager", "employee", "sales"].includes(profile.role)) {
            setAccountType(profile.role === "sales" ? "employee" : profile.role);
          }
          setForm({
            full_name: profile.full_name || "",
            company_name: profile.company_name || "",
            phone: profile.phone || "",
            address: profile.address || "",
            city: profile.city || "",
            state: profile.state || "",
            zip: profile.zip || "",
          });
        }
      } catch {}
      setLoading(false);
    }
    init();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountType) { setError("Please select an account type"); return; }
    if (!form.full_name.trim()) { setError("Full name is required"); return; }
    if (!form.phone.trim()) { setError("Phone number is required"); return; }
    if (!form.address.trim()) { setError("Address is required"); return; }
    if (!form.city.trim()) { setError("City is required"); return; }
    if (!form.state.trim()) { setError("State is required"); return; }
    if (!form.zip.trim()) { setError("Zip code is required"); return; }

    setSaving(true);
    setError("");

    const role = accountType === "employee" ? "sales" : accountType;

    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...form, role }),
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save");
      }
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  const inputClass = "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600/30 transition-colors";

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Complete Your Profile</h1>
          <p className="text-gray-500 mt-2">Please provide your contact information to continue.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Account Type <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 gap-2">
                {ACCOUNT_TYPES.map((t) => {
                  const Icon = t.icon;
                  const selected = accountType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setAccountType(t.value)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-center cursor-pointer ${
                        selected
                          ? "border-green-600 bg-green-50 text-green-700"
                          : "border-gray-200 hover:border-gray-300 text-gray-600"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs font-semibold">{t.label}</span>
                      <span className="text-[10px] leading-tight opacity-70">{t.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Full Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Your full name"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Company Name</label>
              <input
                type="text"
                value={form.company_name}
                onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                placeholder="Your business name (optional)"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone <span className="text-red-500">*</span></label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="(555) 555-5555"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Address <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Street address"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">City <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="City"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">State <span className="text-red-500">*</span></label>
                <select
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">--</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Zip <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.zip}
                  onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                  placeholder="e.g. 75001"
                  maxLength={10}
                  className={inputClass}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 cursor-pointer mt-2"
            >
              {saving ? (
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              ) : (
                "Continue"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
