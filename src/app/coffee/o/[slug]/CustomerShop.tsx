"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";

/**
 * Enrolled-customer shop widget. Mounted inside the branded
 * storefront page for signed-in customers whose
 * profiles.storefront_tenant_id equals this tenant's id.
 *
 * Every price shown comes from a server-side /api/storefront/quote
 * roundtrip — we re-quote whenever the cart changes so per-line
 * commission math matches the checkout call exactly. Nothing about
 * price ever originates in the browser.
 */

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  image_url: string | null;
  active: boolean;
}

interface QuoteLine {
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  tenant_price_per_unit: number;
  tenant_price_amount: number;
}
interface Quote {
  lines: QuoteLine[];
  totals: {
    tenant_price_total: number;
    order_total: number;
  };
}

export default function CustomerShop({
  tenantId,
  tenantSlug,
  products,
  primary,
  accent,
}: {
  tenantId: string;
  tenantSlug: string;
  products: Product[];
  primary: string;
  accent: string;
}) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([product_id, quantity]) => ({ product_id, quantity })),
    [cart],
  );
  const cartCount = cartLines.reduce((a, l) => a + l.quantity, 0);

  const refreshQuote = useCallback(async () => {
    if (cartLines.length === 0) {
      setQuote(null);
      setQuoteErr(null);
      return;
    }
    setQuoting(true);
    setQuoteErr(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/storefront/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ tenant_id: tenantId, cart: cartLines }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to price cart");
      }
      const body = (await res.json()) as { quote: Quote };
      setQuote(body.quote);
    } catch (e) {
      setQuoteErr(e instanceof Error ? e.message : "Failed");
      setQuote(null);
    } finally {
      setQuoting(false);
    }
  }, [cartLines, tenantId]);

  useEffect(() => {
    void refreshQuote();
  }, [refreshQuote]);

  function setQty(productId: string, quantity: number) {
    setCart((c) => {
      const next = { ...c };
      if (quantity <= 0) delete next[productId];
      else next[productId] = quantity;
      return next;
    });
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((p) => {
          const qty = cart[p.id] ?? 0;
          const line = quote?.lines.find((l) => l.product_id === p.id);
          const unit = line?.tenant_price_per_unit;
          return (
            <div
              key={p.id}
              className="rounded-lg overflow-hidden border border-gray-200 bg-white flex flex-col"
            >
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
                  No image
                </div>
              )}
              <div className="p-4 flex-1 flex flex-col">
                <div className="text-xs text-gray-500 uppercase tracking-wide">{p.sku}</div>
                <div className="font-semibold text-gray-900">{p.name}</div>
                {p.description ? (
                  <div className="mt-1 text-sm text-gray-600 flex-1">{p.description}</div>
                ) : (
                  <div className="flex-1" />
                )}
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {unit != null ? `$${unit.toFixed(2)}` : "—"}
                    <span className="text-xs text-gray-500 ml-1">/ea</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setQty(p.id, Math.max(0, qty - 1))}
                      className="w-7 h-7 border rounded text-sm"
                      aria-label="Decrease"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      className="w-14 border rounded px-2 py-1 text-sm text-center"
                      value={qty}
                      onChange={(e) => setQty(p.id, Math.max(0, Number(e.target.value)))}
                    />
                    <button
                      onClick={() => setQty(p.id, qty + 1)}
                      className="w-7 h-7 border rounded text-sm"
                      style={{ background: accent, color: primary, borderColor: accent }}
                      aria-label="Increase"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {cartCount > 0 ? (
        <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg border border-gray-200 p-4 w-80">
          <div className="flex items-center justify-between">
            <div className="font-medium">
              Cart ({cartCount} item{cartCount === 1 ? "" : "s"})
            </div>
            {quoting ? <div className="text-xs text-gray-500">Pricing…</div> : null}
          </div>
          {quoteErr ? (
            <div className="mt-2 text-sm text-red-700">{quoteErr}</div>
          ) : null}
          {quote ? (
            <>
              <div className="mt-2 text-sm space-y-1 max-h-40 overflow-y-auto">
                {quote.lines.map((l) => (
                  <div key={l.product_id} className="flex justify-between">
                    <span className="truncate mr-2">
                      {l.product_name} × {l.quantity}
                    </span>
                    <span>${l.tenant_price_amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 border-t pt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span>${quote.totals.order_total.toFixed(2)}</span>
              </div>
              <button
                onClick={() => setCheckoutOpen(true)}
                className="mt-3 w-full rounded-md text-white text-sm py-2 font-medium"
                style={{ background: primary, color: accent }}
              >
                Checkout
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {checkoutOpen ? (
        <CheckoutModal
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          cart={cartLines}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={(orderNumber) => {
            setCart({});
            setCheckoutOpen(false);
            router.push(`/coffee/orders?just_ordered=${orderNumber}`);
          }}
        />
      ) : null}
    </div>
  );
}

function CheckoutModal({
  tenantId,
  tenantSlug,
  cart,
  onClose,
  onSuccess,
}: {
  tenantId: string;
  tenantSlug: string;
  cart: Array<{ product_id: string; quantity: number }>;
  onClose: () => void;
  onSuccess: (orderNumber: string) => void;
}) {
  const [form, setForm] = useState({
    billing_business_name: "",
    billing_contact_name: "",
    billing_email: "",
    billing_phone: "",
    billing_address: "",
    billing_city: "",
    billing_state: "",
    billing_zip: "",
    shipping_business_name: "",
    shipping_name: "",
    shipping_address: "",
    shipping_city: "",
    shipping_state: "",
    shipping_zip: "",
    shipping_phone: "",
    notes: "",
  });
  const [copyBilling, setCopyBilling] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const shippingSource = copyBilling
        ? {
            business_name: form.billing_business_name,
            name: form.billing_contact_name,
            address: form.billing_address,
            city: form.billing_city,
            state: form.billing_state,
            zip: form.billing_zip,
            phone: form.billing_phone,
          }
        : {
            business_name: form.shipping_business_name,
            name: form.shipping_name,
            address: form.shipping_address,
            city: form.shipping_city,
            state: form.shipping_state,
            zip: form.shipping_zip,
            phone: form.shipping_phone,
          };
      const res = await fetch("/api/storefront/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          cart,
          shipping: shippingSource,
          billing: {
            business_name: form.billing_business_name,
            contact_name: form.billing_contact_name,
            email: form.billing_email,
            phone: form.billing_phone,
            address: form.billing_address,
            city: form.billing_city,
            state: form.billing_state,
            zip: form.billing_zip,
          },
          notes: form.notes || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Checkout failed");
      }
      const body = (await res.json()) as { order_number: string };
      onSuccess(body.order_number);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass = "w-full border rounded px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
      >
        <div className="flex items-center justify-between">
          <div className="font-semibold text-lg">Checkout — {tenantSlug}</div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 text-sm"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2 font-medium mt-2">Billing</div>
          <input required placeholder="Business name" className={fieldClass}
            value={form.billing_business_name} onChange={(e) => set("billing_business_name", e.target.value)} />
          <input required placeholder="Contact name" className={fieldClass}
            value={form.billing_contact_name} onChange={(e) => set("billing_contact_name", e.target.value)} />
          <input required type="email" placeholder="Email" className={fieldClass}
            value={form.billing_email} onChange={(e) => set("billing_email", e.target.value)} />
          <input required placeholder="Phone" className={fieldClass}
            value={form.billing_phone} onChange={(e) => set("billing_phone", e.target.value)} />
          <input required placeholder="Street address" className={"col-span-2 " + fieldClass}
            value={form.billing_address} onChange={(e) => set("billing_address", e.target.value)} />
          <input required placeholder="City" className={fieldClass}
            value={form.billing_city} onChange={(e) => set("billing_city", e.target.value)} />
          <input required placeholder="State" maxLength={2} className={fieldClass}
            value={form.billing_state} onChange={(e) => set("billing_state", e.target.value.toUpperCase())} />
          <input required placeholder="ZIP" className={fieldClass}
            value={form.billing_zip} onChange={(e) => set("billing_zip", e.target.value)} />

          <label className="col-span-2 mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={copyBilling} onChange={(e) => setCopyBilling(e.target.checked)} />
            Ship to billing address
          </label>

          {!copyBilling ? (
            <>
              <div className="col-span-2 font-medium">Shipping</div>
              <input required placeholder="Business name" className={fieldClass}
                value={form.shipping_business_name} onChange={(e) => set("shipping_business_name", e.target.value)} />
              <input required placeholder="Contact name" className={fieldClass}
                value={form.shipping_name} onChange={(e) => set("shipping_name", e.target.value)} />
              <input required placeholder="Street address" className={"col-span-2 " + fieldClass}
                value={form.shipping_address} onChange={(e) => set("shipping_address", e.target.value)} />
              <input required placeholder="City" className={fieldClass}
                value={form.shipping_city} onChange={(e) => set("shipping_city", e.target.value)} />
              <input required placeholder="State" maxLength={2} className={fieldClass}
                value={form.shipping_state} onChange={(e) => set("shipping_state", e.target.value.toUpperCase())} />
              <input required placeholder="ZIP" className={fieldClass}
                value={form.shipping_zip} onChange={(e) => set("shipping_zip", e.target.value)} />
              <input required placeholder="Phone" className={"col-span-2 " + fieldClass}
                value={form.shipping_phone} onChange={(e) => set("shipping_phone", e.target.value)} />
            </>
          ) : null}

          <textarea
            placeholder="Order notes (optional)"
            className={"col-span-2 " + fieldClass}
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        {error ? <div className="mt-3 text-red-700 text-sm">{error}</div> : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-black text-white px-5 py-2 text-sm disabled:opacity-60"
          >
            {submitting ? "Placing order…" : "Place order"}
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          You'll receive a QuickBooks invoice by email for payment. Order stays
          in "awaiting payment" until the invoice is paid.
        </div>
      </form>
    </div>
  );
}
