"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Search, X, Building2 } from "lucide-react";
import type { SalesAccount } from "@/lib/salesTypes";

export default function AccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<SalesAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) setToken(session.access_token);
    }
    init();
  }, []);

  const fetchAccounts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/sales/accounts", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setAccounts(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const filtered = accounts.filter((a) =>
    !search || a.business_name.toLowerCase().includes(search.toLowerCase()) ||
    (a.contact_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Accounts</h1>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search accounts..."
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-green-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Building2 className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No accounts yet. Accounts are auto-created when deals are won.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">Business</th>
                <th className="px-4 py-3 font-medium text-gray-500">Contact</th>
                <th className="px-4 py-3 font-medium text-gray-500">Phone</th>
                <th className="px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="px-4 py-3 font-medium text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((acct) => (
                <tr
                  key={acct.id}
                  className="hover:bg-gray-50/50 cursor-pointer"
                  onClick={() => router.push(`/sales/accounts/${acct.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{acct.business_name}</td>
                  <td className="px-4 py-3 text-gray-600">{acct.contact_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{acct.phone || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{acct.email || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(acct.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
