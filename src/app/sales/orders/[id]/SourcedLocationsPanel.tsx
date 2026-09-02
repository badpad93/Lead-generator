"use client";

/**
 * Sourced Locations panel — mounts on the order detail page for
 * order_type='location_services' orders (after the deposit is
 * paid, per the Next Step verb 'source_locations').
 *
 * Two input modes:
 *   1. Link an existing lead (search bar of sales_leads where
 *      entity_type='location'). Denormalized fields are copied
 *      server-side at attach time.
 *   2. Add manually — the rep types a location that has no lead
 *      row yet.
 *
 * Each attached location shows a status pill, a Secure control
 * (opens a small tier picker inline), and a Detach control (only
 * while the row is still 'sourced'). Securing stamps the pricing
 * snapshot from src/lib/pricing/locationPricing.ts and pro-rata
 * credits the deposit against the accumulated placement fees.
 *
 * "Invoice remaining balance" is the manual fallback the ask
 * called out — a rep can fire the remainder invoice against the
 * currently-secured rows regardless of whether the quota was
 * met. Auto-fire on quota-reached happens server-side when the
 * final secure lands.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, CheckCircle2, XCircle, Search, Plus, Loader2, DollarSign } from "lucide-react";

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

type Mode = "link" | "manual";

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
  const [mode, setMode] = useState<Mode>("link");
  const [busy, setBusy] = useState<string | null>(null);

  // Link-mode state.
  const [leadSearch, setLeadSearch] = useState("");
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");

  // Manual-mode state.
  const [manual, setManual] = useState({
    business_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    machine_count: 1,
    machine_type: "AI",
  });

  // Secure-mode inline picker per row.
  const [securingRow, setSecuringRow] = useState<string | null>(null);
  const [secureTier, setSecureTier] = useState<1 | 2 | 3>(1);
  const [priceOverride, setPriceOverride] = useState<string>("");

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

  // Pull the lead pool once on mount — filter to entity_type='location'
  // client-side. The list route already caps at 500 rows which is
  // enough for a searchable dropdown; if a market ever outgrows that
  // cap we can add a server-side search parameter.
  useEffect(() => {
    if (mode !== "link" || leads.length > 0) return;
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
  }, [mode, leads.length, token]);

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
  const estimatedRemaining = Math.max(0, totalSecuredValue - depositAmount);
  const alreadyInvoiced =
    order.location_remaining_invoice_status === "sent" ||
    order.location_remaining_invoice_status === "paid";

  async function attachExistingLead() {
    if (!selectedLeadId) return;
    setBusy("attach");
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

  async function attachManual() {
    if (!manual.business_name.trim()) {
      setError("Business name is required");
      return;
    }
    setBusy("attach");
    try {
      const res = await fetch(`/api/sales/orders/${orderId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(manual),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Attach failed");
      setManual({
        business_name: "",
        contact_name: "",
        contact_email: "",
        contact_phone: "",
        address: "",
        city: "",
        state: "",
        zip: "",
        machine_count: 1,
        machine_type: "AI",
      });
      await fetchLocations();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function secure(row: SourcedLocation) {
    setBusy(`secure:${row.id}`);
    try {
      const payload: Record<string, unknown> = { auto_invoice: true };
      if (order.is_ten_ten_ten) {
        payload.is_ten_ten_ten = true;
      } else {
        payload.tier = secureTier;
      }
      const override = Number(priceOverride);
      if (!Number.isNaN(override) && override > 0) payload.price_override = override;

      const res = await fetch(`/api/sales/orders/${orderId}/locations/${row.id}/secure`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Secure failed");
      setSecuringRow(null);
      setPriceOverride("");
      await fetchLocations();
      // If auto-invoice fired, refresh the parent order so the
      // "Location Services Remaining Balance" pills update.
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

      {/* Deposit / credit summary strip */}
      <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 flex items-center gap-3 text-xs">
        <DollarSign className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-blue-800">
          Deposit paid <strong>${depositAmount.toFixed(2)}</strong>
          {" · "}
          Secured value <strong>${totalSecuredValue.toFixed(2)}</strong>
          {" · "}
          {estimatedRemaining > 0 ? (
            <>Est. remaining <strong>${estimatedRemaining.toFixed(2)}</strong></>
          ) : (
            <>Deposit covers secured value</>
          )}
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        </div>
      ) : locations.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">
          No locations attached yet. Link an existing lead below, or add one manually.
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
                      <span className="text-[10px] rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                        {row.tier_label}
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
                      ${Number(row.secured_price ?? 0).toFixed(2)} secured price · deposit credit ${Number(row.deposit_credit_applied ?? 0).toFixed(2)}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0 flex flex-col gap-1 items-end">
                  {row.status === "sourced" && securingRow !== row.id && (
                    <>
                      <button
                        onClick={() => {
                          setSecuringRow(row.id);
                          setPriceOverride("");
                        }}
                        disabled={busy !== null}
                        className="rounded px-2 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                      >
                        Secure
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

              {securingRow === row.id && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                  {order.is_ten_ten_ten ? (
                    <span className="text-xs text-gray-600">
                      10/10/10 prepaid — $400 fixed
                    </span>
                  ) : (
                    <>
                      <label className="text-xs text-gray-600">Tier:</label>
                      <select
                        value={secureTier}
                        onChange={(e) => setSecureTier(Number(e.target.value) as 1 | 2 | 3)}
                        className="rounded border border-gray-200 px-2 py-1 text-xs"
                      >
                        <option value={1}>Basic — $500</option>
                        <option value={2}>Premium — $800</option>
                        <option value={3}>Elite — $1200</option>
                      </select>
                    </>
                  )}
                  <label className="text-xs text-gray-600">Or override $:</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceOverride}
                    onChange={(e) => setPriceOverride(e.target.value)}
                    className="w-20 rounded border border-gray-200 px-2 py-1 text-xs"
                    placeholder="0.00"
                  />
                  <button
                    onClick={() => secure(row)}
                    disabled={busy === `secure:${row.id}`}
                    className="rounded px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                  >
                    {busy === `secure:${row.id}` ? "Saving…" : "Confirm secure"}
                  </button>
                  <button
                    onClick={() => setSecuringRow(null)}
                    className="rounded px-2 py-1 text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Manual invoice fallback — sits above the add-form because
          this is the payoff for the panel; a rep who's ready to
          bill shouldn't hunt past the input widgets for it. */}
      {securedCount > 0 && !alreadyInvoiced && (
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

      {/* Add form */}
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => setMode("link")}
            className={`rounded px-2 py-1 text-xs font-medium cursor-pointer ${mode === "link" ? "bg-white ring-1 ring-blue-300 text-blue-700" : "text-gray-500 hover:text-gray-700"}`}
          >
            <Search className="inline h-3 w-3 mr-1" />
            Link existing lead
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`rounded px-2 py-1 text-xs font-medium cursor-pointer ${mode === "manual" ? "bg-white ring-1 ring-blue-300 text-blue-700" : "text-gray-500 hover:text-gray-700"}`}
          >
            <Plus className="inline h-3 w-3 mr-1" />
            Add manually
          </button>
        </div>

        {mode === "link" ? (
          <div className="space-y-2">
            <input
              type="search"
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
              placeholder="Search leads by name, address, city…"
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs"
            />
            <div className="max-h-40 overflow-y-auto rounded border border-gray-200 bg-white divide-y divide-gray-100">
              {leadsLoading ? (
                <div className="px-2 py-2 text-xs text-gray-400">Loading leads…</div>
              ) : filteredLeads.length === 0 ? (
                <div className="px-2 py-2 text-xs text-gray-400">
                  {leadSearch ? "No matching location leads." : "No location leads available."}
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
              onClick={attachExistingLead}
              disabled={!selectedLeadId || busy === "attach"}
              className="w-full rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer disabled:opacity-50"
            >
              {busy === "attach" ? "Attaching…" : "Attach selected lead"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input
              value={manual.business_name}
              onChange={(e) => setManual({ ...manual, business_name: e.target.value })}
              placeholder="Business name *"
              className="col-span-2 rounded border border-gray-200 px-2 py-1.5 text-xs"
            />
            <input
              value={manual.address}
              onChange={(e) => setManual({ ...manual, address: e.target.value })}
              placeholder="Street address"
              className="col-span-2 rounded border border-gray-200 px-2 py-1.5 text-xs"
            />
            <input
              value={manual.city}
              onChange={(e) => setManual({ ...manual, city: e.target.value })}
              placeholder="City"
              className="rounded border border-gray-200 px-2 py-1.5 text-xs"
            />
            <div className="flex gap-2">
              <input
                value={manual.state}
                onChange={(e) => setManual({ ...manual, state: e.target.value })}
                placeholder="State"
                maxLength={2}
                className="w-1/2 rounded border border-gray-200 px-2 py-1.5 text-xs uppercase"
              />
              <input
                value={manual.zip}
                onChange={(e) => setManual({ ...manual, zip: e.target.value })}
                placeholder="ZIP"
                className="w-1/2 rounded border border-gray-200 px-2 py-1.5 text-xs"
              />
            </div>
            <input
              value={manual.contact_name}
              onChange={(e) => setManual({ ...manual, contact_name: e.target.value })}
              placeholder="Contact name"
              className="rounded border border-gray-200 px-2 py-1.5 text-xs"
            />
            <input
              value={manual.contact_phone}
              onChange={(e) => setManual({ ...manual, contact_phone: e.target.value })}
              placeholder="Phone"
              className="rounded border border-gray-200 px-2 py-1.5 text-xs"
            />
            <input
              value={manual.contact_email}
              onChange={(e) => setManual({ ...manual, contact_email: e.target.value })}
              placeholder="Contact email"
              className="col-span-2 rounded border border-gray-200 px-2 py-1.5 text-xs"
            />
            <select
              value={manual.machine_type}
              onChange={(e) => setManual({ ...manual, machine_type: e.target.value })}
              className="rounded border border-gray-200 px-2 py-1.5 text-xs"
            >
              <option value="AI">AI</option>
              <option value="Snack">Snack</option>
              <option value="Drink">Drink</option>
              <option value="Combo">Combo</option>
              <option value="Coffee">Coffee</option>
            </select>
            <input
              type="number"
              min="1"
              value={manual.machine_count}
              onChange={(e) => setManual({ ...manual, machine_count: Number(e.target.value) || 1 })}
              placeholder="Machines"
              className="rounded border border-gray-200 px-2 py-1.5 text-xs"
            />
            <button
              onClick={attachManual}
              disabled={!manual.business_name.trim() || busy === "attach"}
              className="col-span-2 w-full rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer disabled:opacity-50"
            >
              {busy === "attach" ? "Adding…" : "Add location"}
            </button>
          </div>
        )}
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
