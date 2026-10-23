"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ChevronDown, ChevronRight, Coffee, Truck, ExternalLink } from "lucide-react";

interface CoffeeItem { product_id: string; name: string; quantity: number; unit_price: number }
interface CoffeeLead {
  business_name: string | null;
  num_locations: string | null;
  estimated_volume: string | null;
  notes: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  items: CoffeeItem[] | null;
  total_cents: number | null;
  fol_signed: boolean | null;
  fol_signature: string | null;
  fol_signed_at: string | null;
  brewer_shipping_cents: number | null;
}
interface Order {
  id: string;
  machine_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  amount_cents: number | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  white_glove: boolean | null;
  delivery_fee_cents: number | null;
  haul_away: boolean | null;
  haul_away_fee_cents: number | null;
  coffee_requested: boolean | null;
  coffee_total_cents: number | null;
  total_cents: number | null;
  status: string | null;
  qb_invoice_id: string | null;
  created_at: string;
  coffee_lead: CoffeeLead | null;
}

const money = (cents: number | null | undefined) => `$${Math.round((cents || 0) / 100).toLocaleString()}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function statusClass(status: string | null): string {
  if (status === "invoiced") return "bg-blue-50 text-blue-700";
  if (status === "paid") return "bg-green-50 text-green-700";
  return "bg-gray-100 text-gray-600";
}

export default function MachineOrdersManager({ token }: { token: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/smart-coolers/orders", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setOrders(data.orders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const run = async () => { await refresh(); };
    run();
  }, [refresh]);

  if (loading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading orders…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Machine Orders</h2>
        <p className="text-sm text-gray-500">
          Smart-cooler purchases with delivery details, add-on fees, and coffee-service leads. Expand a row for the full order.
        </p>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {orders.length === 0 ? (
        <p className="text-sm text-gray-400">No machine orders yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Machine</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Coffee</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o) => (
                <OrderRows key={o.id} order={o} expanded={!!open[o.id]} onToggle={() => setOpen((s) => ({ ...s, [o.id]: !s[o.id] }))} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrderRows({ order, expanded, onToggle }: { order: Order; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer hover:bg-gray-50" onClick={onToggle}>
        <td className="px-3 py-2 text-gray-400">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDate(order.created_at)}</td>
        <td className="px-3 py-2 font-medium text-gray-800">{order.machine_name || "—"}</td>
        <td className="px-3 py-2 text-gray-600">{order.full_name || "—"}<br /><span className="text-xs text-gray-400">{order.email}</span></td>
        <td className="px-3 py-2">{order.coffee_requested ? <Coffee className="h-4 w-4 text-green-600" /> : <span className="text-gray-300">—</span>}</td>
        <td className="px-3 py-2 font-semibold text-gray-900">{money(order.total_cents ?? order.amount_cents)}</td>
        <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusClass(order.status)}`}>{order.status || "pending"}</span></td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/60">
          <td />
          <td colSpan={6} className="px-3 pb-4 pt-1">
            <OrderDetail order={order} />
          </td>
        </tr>
      )}
    </>
  );
}

function OrderDetail({ order }: { order: Order }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Panel title="Delivery" icon={Truck}>
        <Addr line={order.delivery_address} city={order.delivery_city} state={order.delivery_state} zip={order.delivery_zip} />
        <p className="mt-2 text-xs text-gray-500">{order.phone || "No phone"}</p>
        <dl className="mt-3 space-y-1 text-sm">
          <Line label={order.white_glove ? "White-glove delivery" : "Standard delivery"} value={money(order.delivery_fee_cents)} />
          {order.haul_away && <Line label="Haul-away / relocation" value={money(order.haul_away_fee_cents)} />}
          <Line label="Machine" value={money(order.amount_cents)} />
          {order.coffee_requested && <Line label="Coffee" value={money(order.coffee_total_cents)} />}
          <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold text-gray-900">
            <span>Total</span><span>{money(order.total_cents ?? order.amount_cents)}</span>
          </div>
        </dl>
        {order.qb_invoice_id && <p className="mt-2 text-xs text-gray-400">QB invoice #{order.qb_invoice_id} <ExternalLink className="inline h-3 w-3" /></p>}
      </Panel>

      {order.coffee_requested ? (
        <Panel title="Coffee service lead" icon={Coffee}>
          <CoffeeDetail lead={order.coffee_lead} />
        </Panel>
      ) : (
        <Panel title="Coffee service" icon={Coffee}>
          <p className="text-sm text-gray-400">Not requested.</p>
        </Panel>
      )}
    </div>
  );
}

function MetaLine({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <p><span className="text-gray-400">{label}:</span> {value}</p>;
}

function CoffeeItems({ items }: { items: CoffeeItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
      {items.map((it, i) => (
        <li key={`${it.product_id}-${i}`} className="flex justify-between px-3 py-1.5 text-xs">
          <span>{it.quantity}× {it.name}</span>
          <span className="font-medium">${(it.unit_price * it.quantity).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

function CoffeeDetail({ lead }: { lead: CoffeeLead | null }) {
  if (!lead) return <p className="text-sm text-gray-400">Requested — no lead details captured.</p>;
  const items = Array.isArray(lead.items) ? lead.items : [];
  const hasAddr = Boolean(lead.delivery_address || lead.delivery_city);
  return (
    <div className="space-y-2 text-sm">
      <MetaLine label="Business" value={lead.business_name} />
      <MetaLine label="Locations" value={lead.num_locations} />
      <MetaLine label="Est. volume" value={lead.estimated_volume} />
      {hasAddr && (
        <div><span className="text-gray-400">Ships to:</span> <Addr line={lead.delivery_address} city={lead.delivery_city} state={lead.delivery_state} zip={lead.delivery_zip} inline /></div>
      )}
      <CoffeeItems items={items} />
      <MetaLine label="Notes" value={lead.notes} />
      {lead.fol_signed && (
        <p className="mt-1 rounded-md bg-green-50 px-2 py-1 text-xs text-green-700">
          FOL agreement signed{lead.fol_signature ? ` by ${lead.fol_signature}` : ""}
          {lead.fol_signed_at ? ` · ${new Date(lead.fol_signed_at).toLocaleDateString()}` : ""}
        </p>
      )}
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Truck; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-800"><Icon className="h-4 w-4 text-green-primary" /> {title}</h4>
      {children}
    </div>
  );
}

function Addr({ line, city, state, zip, inline }: { line: string | null; city: string | null; state: string | null; zip: string | null; inline?: boolean }) {
  if (!line && !city) return <span className="text-gray-400">No address</span>;
  const second = [city, state].filter(Boolean).join(", ") + (zip ? ` ${zip}` : "");
  if (inline) return <span>{[line, second].filter(Boolean).join(", ")}</span>;
  return (
    <address className="not-italic text-sm text-gray-700">
      {line}<br />{second}
    </address>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-gray-600"><span>{label}</span><span className="font-medium text-gray-900">{value}</span></div>;
}
