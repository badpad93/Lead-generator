"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

interface QuoteRow {
  id: string;
  customer_profile_id: string | null;
  prospect_company: string | null;
  prospect_email: string | null;
  selected_tier_name: string | null;
  status: string;
  total: number;
  created_at: string;
  sent_at: string | null;
}

async function authHeader(): Promise<HeadersInit> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export default function OperatorQuotesPage() {
  const [quotes, setQuotes] = useState<QuoteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/storefront/quotes", { headers: await authHeader() });
        if (res.status === 403) {
          setError("Only a storefront owner can manage quotes.");
          setQuotes([]);
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        const body = (await res.json()) as { quotes: QuoteRow[] };
        setQuotes(body.quotes);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load quotes");
        setQuotes([]);
      }
    })();
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-8">
      <Link href="/coffee/storefront" className="text-sm text-gray-500">← Storefront</Link>
      <div className="flex items-center justify-between mt-1">
        <h1 className="text-2xl font-semibold">Quotes</h1>
        <Link href="/coffee/storefront/quotes/new" className="rounded-md bg-black text-white px-4 py-2 text-sm">
          Create quote
        </Link>
      </div>
      {error ? <div className="mt-4 text-sm text-red-700">{error}</div> : null}
      {quotes === null ? (
        <div className="mt-6 text-gray-500">Loading…</div>
      ) : quotes.length === 0 ? (
        <div className="mt-6 text-gray-600">No quotes yet. Create your first one.</div>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 text-xs uppercase">
              <th className="py-2">Customer</th>
              <th>Tier</th>
              <th className="text-right">Amount</th>
              <th>Status</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="border-t border-gray-100">
                <td className="py-2">{q.prospect_company || q.prospect_email || (q.customer_profile_id ? "Customer" : "—")}</td>
                <td>{q.selected_tier_name ?? "—"}</td>
                <td className="text-right">${Number(q.total).toFixed(2)}</td>
                <td><span className="capitalize">{q.status}</span></td>
                <td>{new Date(q.created_at).toLocaleDateString()}</td>
                <td className="text-right">
                  <Link href={`/coffee/storefront/quotes/new?id=${q.id}`} className="text-blue-700 hover:underline">
                    {q.status === "draft" ? "Edit" : "View"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
