"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Coffee, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export default function CoffeeApplyPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    contact_name: "",
    business_name: "",
    email: "",
    phone: "",
    shipping_address: "",
    shipping_city: "",
    shipping_state: "",
    shipping_zip: "",
    num_locations: "",
    existing_machines: "",
    estimated_volume: "",
    notes: "",
    agreement_signed: false,
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
          const data: Profile = await res.json();
          setProfile(data);
          setForm((prev) => ({
            ...prev,
            contact_name: data.full_name || "",
            business_name: data.company_name || "",
            email: data.email || "",
            phone: data.phone || "",
            shipping_address: data.address || "",
            shipping_city: data.city || "",
            shipping_state: data.state || "",
            shipping_zip: data.zip || "",
          }));
        }
      } catch {}
      setLoading(false);
    }
    init();
  }, [router]);

  function updateForm(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/coffee/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          num_locations: form.num_locations ? parseInt(form.num_locations) : null,
          existing_machines: form.existing_machines ? parseInt(form.existing_machines) : null,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to submit application");
      }
    } catch {
      setError("Failed to submit application");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (profile?.coffee_access_enabled) {
    return (
      <div className="min-h-screen bg-gray-950">
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
          <div className="rounded-full bg-green-900/50 p-4 mb-6">
            <CheckCircle2 className="h-12 w-12 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">You&apos;re Already Approved!</h1>
          <p className="mt-2 text-gray-400">You have full access to our coffee services marketplace.</p>
          <Link
            href="/coffee"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700"
          >
            Go to Marketplace
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (profile?.coffee_application_status === "pending") {
    return (
      <div className="min-h-screen bg-gray-950">
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
          <div className="rounded-full bg-yellow-900/50 p-4 mb-6">
            <Clock className="h-12 w-12 text-yellow-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Application Under Review</h1>
          <p className="mt-2 text-gray-400 max-w-md">
            Your coffee services application is being reviewed. We&apos;ll notify you once a decision has been made.
          </p>
          <Link
            href="/coffee"
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-green-400 transition-colors hover:text-green-300"
          >
            Browse Marketplace
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-950">
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
          <div className="rounded-full bg-green-900/50 p-4 mb-6">
            <CheckCircle2 className="h-12 w-12 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Application Submitted!</h1>
          <p className="mt-2 text-gray-400 max-w-md">
            Thank you for applying. We&apos;ll review your application and get back to you shortly.
          </p>
          <Link
            href="/coffee"
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-green-400 transition-colors hover:text-green-300"
          >
            Browse Marketplace
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const inputClass = "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 pb-8 pt-10">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-900/50 mb-6">
            <Coffee className="h-8 w-8 text-green-400" />
          </div>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Apply for Coffee Services</h1>
          <p className="mt-3 text-gray-400 max-w-lg mx-auto">
            Get access to premium coffee products at competitive prices for your vending operations.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
        {error && (
          <div className="mb-6 rounded-xl border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-lg font-bold text-white mb-4">Contact Information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Full Name</label>
                <input
                  type="text"
                  required
                  value={form.contact_name}
                  onChange={(e) => updateForm("contact_name", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Business Name</label>
                <input
                  type="text"
                  required
                  value={form.business_name}
                  onChange={(e) => updateForm("business_name", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => updateForm("email", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateForm("phone", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-lg font-bold text-white mb-4">Shipping Address</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Address</label>
                <input
                  type="text"
                  value={form.shipping_address}
                  onChange={(e) => updateForm("shipping_address", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">City</label>
                <input
                  type="text"
                  value={form.shipping_city}
                  onChange={(e) => updateForm("shipping_city", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">State</label>
                <input
                  type="text"
                  value={form.shipping_state}
                  onChange={(e) => updateForm("shipping_state", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">ZIP Code</label>
                <input
                  type="text"
                  value={form.shipping_zip}
                  onChange={(e) => updateForm("shipping_zip", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-lg font-bold text-white mb-4">Business Details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Number of Locations</label>
                <input
                  type="number"
                  min={0}
                  value={form.num_locations}
                  onChange={(e) => updateForm("num_locations", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Existing Machines</label>
                <input
                  type="number"
                  min={0}
                  value={form.existing_machines}
                  onChange={(e) => updateForm("existing_machines", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Estimated Monthly Coffee Volume</label>
                <input
                  type="text"
                  placeholder="e.g., 500 lbs, 200 cases"
                  value={form.estimated_volume}
                  onChange={(e) => updateForm("estimated_volume", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                  placeholder="Anything else you'd like us to know..."
                  className={inputClass + " resize-none"}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.agreement_signed}
                onChange={(e) => updateForm("agreement_signed", e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-800 text-green-600 focus:ring-green-500 cursor-pointer"
              />
              <span className="text-sm text-gray-300">
                I agree to the Coffee Service Agreement terms and conditions
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting || !form.agreement_signed}
            className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 hover:shadow-md disabled:bg-gray-700 disabled:text-gray-400 cursor-pointer disabled:cursor-not-allowed"
          >
            {submitting ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            ) : (
              "Submit Application"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
