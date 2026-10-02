"use client";

import { useEffect, useState } from "react";
import { Loader2, FileText, ScrollText, ClipboardCheck, ExternalLink } from "lucide-react";
import type {
  LeadCustomerActivity,
  LeadOrderSummary,
  LeadQuoteSummary,
  LeadAgreementSummary,
} from "@/lib/leadActivity";

/**
 * Shows the customer's orders, quotes, and agreements for a lead the rep owns.
 * Rendered inside the Edit Lead modal. Data is scoped server-side: the route
 * only returns activity for leads assigned to the requesting rep.
 */
function useLeadActivity(leadId: string, token: string) {
  const [activity, setActivity] = useState<LeadCustomerActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/sales/leads/${leadId}/activity`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Failed to load activity");
          return;
        }
        setActivity(data as LeadCustomerActivity);
      } catch {
        if (!cancelled) setError("Failed to load activity");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [leadId, token]);

  return { activity, loading, error };
}

function splitActivity(activity: LeadCustomerActivity | null) {
  const orders = activity?.orders ?? [];
  const quotes = activity?.quotes ?? [];
  const agreements = activity?.agreements ?? [];
  const isEmpty = orders.length + quotes.length + agreements.length === 0;
  return { orders, quotes, agreements, isEmpty };
}

export default function LeadActivitySection({ leadId, token }: { leadId: string; token: string }) {
  const { activity, loading, error } = useLeadActivity(leadId, token);

  if (loading) {
    return (
      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading customer activity…
      </div>
    );
  }

  if (error) {
    return <p className="mt-5 border-t border-gray-100 pt-4 text-sm text-gray-400">{error}</p>;
  }

  const { orders, quotes, agreements, isEmpty } = splitActivity(activity);

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Customer Activity</h3>
      {isEmpty ? (
        <p className="text-sm text-gray-400">No orders, quotes, or agreements yet for this customer.</p>
      ) : (
        <div className="space-y-4">
          <OrdersBlock orders={orders} />
          <QuotesBlock quotes={quotes} />
          <AgreementsBlock agreements={agreements} />
        </div>
      )}
    </div>
  );
}

function money(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function when(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "";
}

function Pill({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
      {text.replace(/_/g, " ")}
    </span>
  );
}

function OrdersBlock({ orders }: { orders: LeadOrderSummary[] }) {
  if (orders.length === 0) return null;
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <FileText className="h-3.5 w-3.5" /> Orders ({orders.length})
      </div>
      <ul className="space-y-1.5">
        {orders.map((o) => (
          <li key={o.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
            <a
              href={`/sales/orders/${o.id}`}
              className="inline-flex items-center gap-1 font-medium text-green-700 hover:underline"
            >
              {o.order_number != null ? `Order #${o.order_number}` : "Order"}
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="flex items-center gap-2 text-gray-500">
              {money(o.total_value)}
              <Pill text={o.status} />
              <Pill text={o.payment_status} />
              <span className="text-xs text-gray-400">{when(o.created_at)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function QuotesBlock({ quotes }: { quotes: LeadQuoteSummary[] }) {
  if (quotes.length === 0) return null;
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <ScrollText className="h-3.5 w-3.5" /> Quotes ({quotes.length})
      </div>
      <ul className="space-y-1.5">
        {quotes.map((q) => (
          <li key={q.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
            <span className="font-medium text-gray-800">{q.quote_number || "Quote"}</span>
            <span className="flex items-center gap-2 text-gray-500">
              {money(q.total)}
              <Pill text={q.status} />
              <span className="text-xs text-gray-400">{when(q.created_at)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AgreementsBlock({ agreements }: { agreements: LeadAgreementSummary[] }) {
  if (agreements.length === 0) return null;
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <ClipboardCheck className="h-3.5 w-3.5" /> Agreements ({agreements.length})
      </div>
      <ul className="space-y-1.5">
        {agreements.map((a) => (
          <li key={a.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
            <span className="font-medium text-gray-800">{(a.agreement_type || "Agreement").replace(/_/g, " ")}</span>
            <span className="flex items-center gap-2 text-gray-500">
              <Pill text={a.status} />
              <span className="text-xs text-gray-400">{when(a.created_at)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
