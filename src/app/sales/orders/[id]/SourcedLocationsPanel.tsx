"use client";

/**
 * Sourced Locations panel — mounts on the order detail page for
 * order_type='location_services' orders after the deposit is paid
 * (per the "source_locations" Next Step verb).
 *
 * Locations can only be attached from existing sales_leads (with
 * entity_type='location'). Manual "type it in" attach was removed
 * so every sourced location goes through the CRM pricing engine
 * end-to-end — attach pulls the tier + price from the lead's
 * linked locations row and locks it as the snapshot; secure just
 * flips status. A rep who needs to attach a location that doesn't
 * exist yet has to create it as a lead first.
 *
 * "Invoice remaining balance" is the manual fallback the product
 * ask called out — fire the remainder invoice against currently-
 * secured rows regardless of quota. Auto-fire on quota-reached
 * still happens server-side when the final secure lands.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, CheckCircle2, XCircle, Search, Loader2, DollarSign } from "lucide-react";

interface OrderSummary {
  deposit_amount: number;
  locations_purchased: number | null;
  is_ten_ten_ten: boolean | null;
  location_remaining_invoice_status?: string | null;
}

interface SourcedLocation {
  id: string;
  lead_id: string | null;
  business_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  machine_count: number | null;
  machine_type: string | null;
  status: "sourced" | "secured" | "declined" | "removed";
  tier: number | null;
  tier_label: string | null;
  secured_price: number | null;
  deposit_credit_applied: number;
  secured_at: string | null;
  attached_at: string;
}

interface LeadOption {
  id: string;
  business_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  entity_type: string | null;
}

export default function SourcedLocationsPanel({
  orderId,
  token,
  order,
  onOrderRefresh,
}: {
  orderId: string;
  token: string;
  order: OrderSummary;
  onOrderRefresh: () => void;
}) {
  const [locations, setLocations] = useState<SourcedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [leadSearch, setLeadSearch] = useState("");
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales/orders/${orderId}/locations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setLocations(data.locations || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Pull the lead pool once. Server-side visibility rules already
  // scope this per the rep's role; the list route caps at 500 rows
  // which is plenty for a searchable dropdown.
  useEffect(() => {
    if (leads.length > 0) return;
    setLeadsLoading(true);
    fetch(`/api/sales/leads`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        const rows: LeadOption[] = (d?.leads ?? d ?? [])
          .filter((l: { entity_type?: string | null }) => (l.entity_type ?? "location") === "location")
          .map((l: LeadOption) => ({
            id: l.id,
            business_name: l.business_name,
            address: l.address,
            city: l.city,
            state: l.state,
            entity_type: l.entity_type,
          }));
        setLeads(rows);
      })
      .catch(() => setLeads([]))
      .finally(() => setLeadsLoading(false));
  }, [leads.length, token]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    const attachedLeadIds = new Set(locations.map((l) => l.lead_id).filter(Boolean));
    return leads
      .filter((l) => !attachedLeadIds.has(l.id))
      .filter((l) => {
        if (!q) return true;
        const hay = `${l.business_name} ${l.address ?? ""} ${l.city ?? ""} ${l.state ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 25);
  }, [leadSearch, leads, locations]);

  const securedCount = locations.filter((l) => l.status === "secured").length;
  const sourcedCount = locations.filter((l) => l.status === "sourced").length;
  const quota = Number(order.locations_purchased) || 0;
  const totalSecuredValue = locations
    .filter((l) => l.status === "secured")
    .reduce((s, l) => s + (Number(l.secured_price) || 0), 0);
  const depositAmount = Number(order.deposit_amount) || 0;
  // 10/10/10 orders prepay the location fees inside the order total
  // — no deposit-vs-remaining split, and the remaining-balance
  // invoice never applies.
  const prepaid = order.is_ten_ten_ten === true;
  const estimatedRemaining = prepaid ? 0 : Math.max(0, totalSecuredValue - depositAmount);
  const alreadyInvoiced =
    order.location_remaining_invoice_status === "sent" ||
    order.location_remaining_invoice_status === "paid";

  async function attachLead() {
    if (!selectedLeadId) return;
    setBusy("attach");
    setError(null);
    try {
      const res = await fetch(`/api/sales/orders/${orderId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lead_id: selectedLeadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Attach failed");
      setSelectedLeadId("");
      setLeadSearch("");
      await fetchLocations();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function secure(row: SourcedLocation) {
    setBusy(`secure:${row.id}`);
    setError(null);
    try {
      const res = await fetch(`/api/sales/orders/${orderId}/locations/${row.id}/secure`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ auto_invoice: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Secure failed");
      await fetchLocations();
      if (data.auto_invoice) onOrderRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function detach(row: SourcedLocation) {
    if (!confirm(`Remove ${row.business_name} from this order?`)) return;
    setBusy(`detach:${row.id}`);
    setError(null);
    try {
      const res = await fetch(`/api/sales/orders/${orderId}/locations/${row.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Detach failed");
      await fetchLocations();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function decline(row: SourcedLocation) {
    if (!confirm(`Mark ${row.business_name} declined?`)) return;
    setBusy(`decline:${row.id}`);
    setError(null);
    try {
      const res = await fetch(`/api/sales/orders/${orderId}/locations/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "declined" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Decline failed");
      await fetchLocations();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function invoiceRemaining() {
    if (alreadyInvoiced) return;
    if (!confirm(`Invoice remaining balance of $${estimatedRemaining.toFixed(2)}?`)) return;
    setBusy("invoice");
    setError(null);
    try {
      const res = await fetch(`/api/sales/orders/${orderId}/locations/invoice-remaining`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trigger: "manual" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invoice failed");
      onOrderRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div id="sourced-locations" className="rounded-xl border border-blue-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-500" /> Sourced Locations
        </h3>
        <div className="text-xs text-gray-500">
          {securedCount} secured{quota > 0 ? ` of ${quota}` : ""}
          {sourcedCount > 0 && <> · {sourcedCount} sourced</>}
        </div>
      </div>

      <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 flex items-center gap-3 text-xs">
        <DollarSign className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-blue-800">
          {prepaid ? (
            <>
              <strong>10/10/10 prepaid</strong> — location fees included in the order total
              {" · "}
              Secured value <strong>${totalSecuredValue.toFixed(2)}</strong>
            </>
          ) : (
            <>
              Deposit paid <strong>${depositAmount.toFixed(2)}</strong>
              {" · "}
              Secured value <strong>${totalSecuredValue.toFixed(2)}</strong>
              {" · "}
              {estimatedRemaining > 0 ? (
                <>Est. remaining <strong>${estimatedRemaining.toFixed(2)}</strong></>
              ) : (
                <>Deposit covers secured value</>
              )}
            </>
          )}
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        </div>
      ) : locations.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">
          No locations attached yet. Link an existing location lead below.
        </p>
      ) : (
        <ul className="space-y-2 mb-4">
          {locations.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 truncate">
                      {row.business_name}
                    </span>
                    <StatusPill status={row.status} />
                    {row.tier_label && (
                      <span className="text-[10px] rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 ring-1 ring-inset ring-blue-100">
                        {row.tier_label}
                        {typeof row.secured_price === "number" && <> · ${Number(row.secured_price).toFixed(2)}</>}
                      </span>
                    )}
                  </div>
                  {(row.address || row.city || row.state) && (
                    <p className="text-xs text-gray-500 truncate">
                      {[row.address, row.city, row.state, row.zip].filter(Boolean).join(", ")}
                    </p>
                  )}
                  {row.status === "secured" && (
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Secured · deposit credit ${Number(row.deposit_credit_applied ?? 0).toFixed(2)}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0 flex flex-col gap-1 items-end">
                  {row.status === "sourced" && (
                    <>
                      <button
                        onClick={() => secure(row)}
                        disabled={busy !== null}
                        className="rounded px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                      >
                        {busy === `secure:${row.id}` ? "Securing…" : "Secure"}
                      </button>
                      <button
                        onClick={() => detach(row)}
                        disabled={busy !== null}
                        className="rounded px-2 py-1 text-[11px] text-gray-500 hover:text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </>
                  )}
                  {row.status === "secured" && (
                    <button
                      onClick={() => decline(row)}
                      disabled={busy !== null}
                      className="rounded px-2 py-1 text-[11px] text-gray-500 hover:text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-50"
                    >
                      Fell through
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Manual invoice fallback — sits above the search so a rep
          ready to bill doesn't scroll past the lookup for it.
          Hidden on prepaid (10/10/10) orders: the location fees
          were collected in the order total, nothing remains. */}
      {!prepaid && securedCount > 0 && !alreadyInvoiced && (
        <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 flex items-center justify-between">
          <div className="text-xs text-purple-800">
            {estimatedRemaining > 0
              ? `Ready to invoice $${estimatedRemaining.toFixed(2)} remaining balance for ${securedCount} secured location${securedCount === 1 ? "" : "s"}.`
              : `Deposit fully covers secured value — no remaining balance to invoice.`}
          </div>
          <button
            onClick={invoiceRemaining}
            disabled={busy === "invoice"}
            className="rounded px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 cursor-pointer disabled:opacity-50"
          >
            {busy === "invoice"
              ? "Invoicing…"
              : estimatedRemaining > 0
                ? "Invoice remaining balance"
                : "Close out (no invoice)"}
          </button>
        </div>
      )}
      {alreadyInvoiced && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Remaining-balance invoice already sent
          {order.location_remaining_invoice_status === "paid" && " and paid"}.
        </div>
      )}

      {/* Attach form — search location leads and pick one. Pricing
          snapshot is stamped server-side from the lead's linked
          locations row (employee_count / traffic_count / hours /
          machines) so tier + $ price are known the moment the row
          appears in the list above. */}
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
        <div className="flex items-center gap-2 mb-2 text-xs font-medium text-gray-700">
          <Search className="h-3 w-3" />
          Link an existing location lead
        </div>
        <div className="space-y-2">
          <input
            type="search"
            value={leadSearch}
            onChange={(e) => setLeadSearch(e.target.value)}
            placeholder="Search by name, address, city…"
            className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs"
          />
          <div className="max-h-40 overflow-y-auto rounded border border-gray-200 bg-white divide-y divide-gray-100">
            {leadsLoading ? (
              <div className="px-2 py-2 text-xs text-gray-400">Loading leads…</div>
            ) : filteredLeads.length === 0 ? (
              <div className="px-2 py-2 text-xs text-gray-400">
                {leadSearch
                  ? "No matching location leads."
                  : "No location leads available. Create one in the Leads section first."}
              </div>
            ) : (
              filteredLeads.map((l) => (
                <label
                  key={l.id}
                  className={`flex items-start gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-blue-50 ${selectedLeadId === l.id ? "bg-blue-50" : ""}`}
                >
                  <input
                    type="radio"
                    name="lead-choice"
                    checked={selectedLeadId === l.id}
                    onChange={() => setSelectedLeadId(l.id)}
                    className="mt-0.5"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-gray-800 truncate">{l.business_name}</span>
                    {(l.address || l.city || l.state) && (
                      <span className="block text-gray-500 truncate">
                        {[l.address, l.city, l.state].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </span>
                </label>
              ))
            )}
          </div>
          <button
            onClick={attachLead}
            disabled={!selectedLeadId || busy === "attach"}
            className="w-full rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer disabled:opacity-50"
          >
            {busy === "attach" ? "Attaching…" : "Attach selected lead"}
          </button>
          <p className="text-[11px] text-gray-500">
            Need a location that isn&apos;t a lead yet? Create it in the Leads section first so the pricing engine can price it.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: SourcedLocation["status"] }) {
  const styles: Record<SourcedLocation["status"], string> = {
    sourced: "bg-blue-100 text-blue-700 ring-blue-200",
    secured: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    declined: "bg-red-100 text-red-700 ring-red-200",
    removed: "bg-gray-100 text-gray-500 ring-gray-200",
  };
  const icon: Record<SourcedLocation["status"], React.ReactNode> = {
    sourced: <MapPin className="h-3 w-3" />,
    secured: <CheckCircle2 className="h-3 w-3" />,
    declined: <XCircle className="h-3 w-3" />,
    removed: <XCircle className="h-3 w-3" />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {icon[status]}
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}
