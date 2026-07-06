"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Briefcase, MapPin, ArrowRight, ArrowLeft, ShoppingCart } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Contract {
  id: string;
  title: string;
  tier: number;
  operator_price: number;
  market_state: string | null;
  market_city: string | null;
  machine_type: string | null;
  locations_needed: number;
  locations_filled: number;
  slots_remaining: number;
  status: string;
  billing_prepaid: boolean;
  deadline_at: string | null;
  submissions: { total: number; accepted: number; pending: number; rejected: number };
  invoices_total: { queued: number; sent: number; paid: number };
}

function fmt(n: number): string {
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OperatorContractsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<Contract[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/operator/contracts", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setContracts(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/operator/contracts"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Briefcase className="h-6 w-6 text-green-primary" /> Your Placement Contracts
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Contracts we&apos;re fulfilling on your behalf. Locations are found by our placement providers — approve the ones you want and we&apos;ll invoice as they&apos;re accepted.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>
      ) : contracts.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
          <Briefcase className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-lg font-semibold text-gray-900 mb-1">No contracts yet</p>
          <p className="text-sm text-gray-500">Your Placement Contracts will show here once your agreement is signed and marked send-to-marketplace.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((c) => {
            const availableForBuy = c.submissions.pending;
            return (
              <Link
                key={c.id}
                href={`/operator/contracts/${c.id}`}
                className="block rounded-2xl border border-gray-100 bg-white p-5 hover:border-green-200 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${c.tier === 3 ? "bg-purple-100 text-purple-700" : c.tier === 2 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                        TIER {c.tier}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize ${c.status === "fulfilled" ? "bg-emerald-100 text-emerald-700" : c.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {c.status.replace(/_/g, " ")}
                      </span>
                      {c.billing_prepaid && (
                        <span className="rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-[10px] font-semibold">PREPAID</span>
                      )}
                      {availableForBuy > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-primary text-white px-2.5 py-0.5 text-[10px] font-semibold">
                          <ShoppingCart className="h-2.5 w-2.5" /> {availableForBuy} to review
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 truncate">{c.title}</h3>
                    <div className="mt-1 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[c.market_city, c.market_state].filter(Boolean).join(", ") || "Any market"}
                      </span>
                      <span>{c.machine_type || "VendEra AI Machine"}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <p className="text-gray-500">Locations filled</p>
                        <p className="font-semibold text-gray-900">{c.locations_filled} / {c.locations_needed}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Available now</p>
                        <p className="font-semibold text-emerald-700">{availableForBuy}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Paid so far</p>
                        <p className="font-semibold text-blue-700">{fmt(c.invoices_total.paid)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Outstanding</p>
                        <p className="font-semibold text-amber-700">{fmt(c.invoices_total.sent + c.invoices_total.queued)}</p>
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-300 shrink-0 mt-1" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
