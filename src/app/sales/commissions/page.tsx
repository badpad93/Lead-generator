"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, DollarSign, Plus, X } from "lucide-react";
import type { SalesCommission } from "@/lib/salesTypes";

interface SalesUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<SalesCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  // Add commission form state
  const [showForm, setShowForm] = useState(false);
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([]);
  const [formUserId, setFormUserId] = useState("");
  const [formGross, setFormGross] = useState("");
  const [formRate, setFormRate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const payout =
    formGross && formRate
      ? Number(formGross) * (Number(formRate) / 100)
      : 0;

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        setToken(session.access_token);
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const me = await res.json();
          setIsAdmin(me.role === "admin" || me.role === "director_of_sales" || me.role === "market_leader");
        }
      }
    }
    init();
  }, []);

  const fetchCommissions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/sales/commissions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setCommissions(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

  async function openForm() {
    setShowForm(true);
    setFormError("");
    if (salesUsers.length === 0 && token) {
      const res = await fetch("/api/sales/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setSalesUsers(await res.json());
    }
  }

  function resetForm() {
    setShowForm(false);
    setFormUserId("");
    setFormGross("");
    setFormRate("");
    setFormNotes("");
    setFormError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formUserId || !formGross || !formRate) {
      setFormError("All fields are required.");
      return;
    }
    const gross = Number(formGross);
    const rate = Number(formRate);
    if (gross <= 0) { setFormError("Gross amount must be positive."); return; }
    if (rate <= 0 || rate > 100) { setFormError("Commission % must be between 1 and 100."); return; }

    setFormSaving(true);
    setFormError("");
    const res = await fetch("/api/sales/commissions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        user_id: formUserId,
        deal_value: gross,
        commission_rate: rate / 100,
        notes: formNotes || null,
      }),
    });
    if (res.ok) {
      resetForm();
      fetchCommissions();
    } else {
      const err = await res.json();
      setFormError(err.error || "Failed to create commission.");
    }
    setFormSaving(false);
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch("/api/sales/commissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, status }),
    });
    fetchCommissions();
  }

  const totalPending = commissions
    .filter((c) => c.status === "pending")
    .reduce((s, c) => s + Number(c.commission_amount), 0);
  const totalApproved = commissions
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + Number(c.commission_amount), 0);
  const totalPaid = commissions
    .filter((c) => c.status === "paid")
    .reduce((s, c) => s + Number(c.commission_amount), 0);

  const statusColor: Record<string, string> = {
    pending: "bg-yellow-50 text-yellow-700 ring-yellow-200",
    approved: "bg-blue-50 text-blue-700 ring-blue-200",
    paid: "bg-green-50 text-green-700 ring-green-200",
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Commissions</h1>
        {isAdmin && !showForm && (
          <button
            onClick={openForm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Commission
          </button>
        )}
      </div>

      {/* Add Commission Form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">New Commission</h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Sales Rep */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sales Rep</label>
                <select
                  value={formUserId}
                  onChange={(e) => setFormUserId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  required
                >
                  <option value="">Select rep...</option>
                  {salesUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Gross Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gross Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formGross}
                  onChange={(e) => setFormGross(e.target.value)}
                  placeholder="400.00"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  required
                />
              </div>

              {/* Commission % */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Commission %</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  value={formRate}
                  onChange={(e) => setFormRate(e.target.value)}
                  placeholder="40"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  required
                />
              </div>
            </div>

            {/* Live Calculation */}
            {formGross && formRate && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-600">
                    <span className="font-medium">${Number(formGross).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                    {" "}x{" "}
                    <span className="font-medium">{formRate}%</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500 uppercase tracking-wide">Total Payout</span>
                    <p className="text-xl font-bold text-green-700">
                      ${payout.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="e.g. Agreement payment for location XYZ"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
              />
            </div>

            {formError && (
              <p className="text-sm text-red-600">{formError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={formSaving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {formSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Commission
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending</p>
          <p className="mt-1 text-2xl font-bold text-yellow-600">
            ${totalPending.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Approved</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">
            ${totalApproved.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Paid</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            ${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-green-600" /></div>
      ) : commissions.length === 0 ? (
        <div className="py-16 text-center">
          <DollarSign className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No commissions yet.{isAdmin ? " Click \"Add Commission\" to create one." : ""}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">Deal</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Gross</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Rate</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Payout</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Date</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-gray-500">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {commissions.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {c.sales_deals?.business_name || c.notes || "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    ${Number(c.deal_value).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {(Number(c.commission_rate) * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-green-600">
                    ${Number(c.commission_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset capitalize ${statusColor[c.status] || ""}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <select
                        value={c.status}
                        onChange={(e) => handleStatusChange(c.id, e.target.value)}
                        className="rounded border border-gray-200 px-2 py-1 text-xs cursor-pointer"
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="paid">Paid</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
