"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Loader2, ShoppingCart, ArrowLeft, AlertCircle, CreditCard } from "lucide-react";
import {
  readGuestCart,
  writeGuestCart,
  clearGuestCart,
  type GuestCartLine,
} from "@/lib/guestCart";

interface DisplayProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  shipping_cost: number;
  image_url: string | null;
  active: boolean;
  stock_status: string;
}

export default function GuestCheckoutPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center bg-black"><Loader2 className="h-8 w-8 animate-spin text-green-500" /></div>}>
      <GuestCheckoutContent />
    </Suspense>
  );
}

function GuestCheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cart, setCart] = useState<GuestCartLine[]>([]);
  const [products, setProducts] = useState<Map<string, DisplayProduct>>(new Map());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceled] = useState(searchParams.get("canceled") === "true");
  const [minOrderCents, setMinOrderCents] = useState<number>(0);
  const [minOrderEnforced, setMinOrderEnforced] = useState<boolean>(true);

  const [form, setForm] = useState({
    shipping_business_name: "",
    shipping_name: "",
    shipping_address: "",
    shipping_city: "",
    shipping_state: "",
    shipping_zip: "",
    shipping_phone: "",
    billing_business_name: "",
    billing_contact_name: "",
    billing_email: "",
    billing_phone: "",
    billing_address: "",
    billing_city: "",
    billing_state: "",
    billing_zip: "",
    notes: "",
  });
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [marketingConsent, setMarketingConsent] = useState(true);
  const [acceptTerms, setAcceptTerms] = useState(false);

  useEffect(() => {
    // Fetch the org-wide minimum-order policy so we can render a
    // banner and disable Place Order until the cart clears it —
    // matches what /api/coffee/guest-checkout enforces server-side.
    fetch("/api/coffee/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s) {
          setMinOrderCents(Number(s.minimum_order_cents) || 0);
          setMinOrderEnforced(!!s.minimum_order_enforced);
        }
      })
      .catch(() => {});

    const localCart = readGuestCart();
    setCart(localCart);
    if (localCart.length === 0) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const ids = localCart.map((l) => l.product_id);
        const url = `/api/coffee/products?ids=${encodeURIComponent(ids.join(","))}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const list: DisplayProduct[] = Array.isArray(data.products) ? data.products : data;
          const map = new Map<string, DisplayProduct>();
          for (const p of list) map.set(p.id, p);
          setProducts(map);
        } else {
          setError("Failed to load cart products");
        }
      } catch {
        setError("Failed to load cart products");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = (k: keyof typeof form, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const removeLine = useCallback((productId: string) => {
    setCart((prev) => {
      const next = prev.filter((l) => l.product_id !== productId);
      writeGuestCart(next);
      return next;
    });
  }, []);

  const changeQty = useCallback((productId: string, qty: number) => {
    if (!Number.isFinite(qty) || qty < 1) return;
    setCart((prev) => {
      const next = prev.map((l) => (l.product_id === productId ? { ...l, quantity: Math.floor(qty) } : l));
      writeGuestCart(next);
      return next;
    });
  }, []);

  const subtotal = cart.reduce((sum, l) => {
    const p = products.get(l.product_id);
    return sum + (p ? p.price * l.quantity : 0);
  }, 0);
  const shippingTotal = cart.reduce((sum, l) => {
    const p = products.get(l.product_id);
    return sum + (p ? (p.shipping_cost || 0) * l.quantity : 0);
  }, 0);
  const total = subtotal + shippingTotal;

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (cart.length === 0) {
      setError("Your cart is empty.");
      return;
    }
    if (!acceptTerms) {
      setError("You must accept the terms to submit this order.");
      return;
    }

    const payload = billingSameAsShipping
      ? {
          ...form,
          billing_business_name: form.shipping_business_name,
          billing_contact_name: form.shipping_name,
          billing_phone: form.shipping_phone,
          billing_address: form.shipping_address,
          billing_city: form.shipping_city,
          billing_state: form.shipping_state,
          billing_zip: form.shipping_zip,
          items: cart,
          marketing_consent: marketingConsent,
        }
      : {
          ...form,
          items: cart,
          marketing_consent: marketingConsent,
        };

    setSubmitting(true);
    try {
      const res = await fetch("/api/coffee/guest-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requires_sign_in) {
          setError("An account already exists for this email. Please sign in first, then complete your order.");
        } else {
          setError(data.error || "Checkout failed.");
        }
        return;
      }
      clearGuestCart();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.tracking_url) {
        router.push(data.tracking_url);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-500" />
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white px-4 py-20">
        <div className="max-w-md mx-auto text-center">
          <ShoppingCart className="mx-auto h-12 w-12 text-gray-500 mb-4" />
          <h1 className="text-2xl font-semibold mb-2">Your cart is empty</h1>
          <p className="text-gray-400 mb-6">Add some products before checking out.</p>
          <Link href="/coffee" className="inline-flex items-center gap-2 bg-green-500 text-black font-semibold px-6 py-3 rounded-lg hover:bg-green-400">
            Browse Coffee
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Link href="/coffee" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to shop
        </Link>

        <h1 className="text-3xl font-bold mb-2">Guest Checkout</h1>
        <p className="text-gray-400 mb-6">
          No account required — we&apos;ll email you a link to claim your account after checkout so you can track this order and reorder easily.
        </p>

        {canceled && (
          <div className="rounded-lg bg-yellow-900/40 border border-yellow-500/40 p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-200 font-semibold">Payment canceled</p>
              <p className="text-yellow-100/80 text-sm">Your cart is saved — try again below.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-900/40 border border-red-500/40 p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-100">{error}</p>
          </div>
        )}

        <form onSubmit={submitOrder} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Section title="Shipping address">
              <Field label="Business name" value={form.shipping_business_name} onChange={(v) => update("shipping_business_name", v)} required />
              <Field label="Contact name" value={form.shipping_name} onChange={(v) => update("shipping_name", v)} required />
              <Field label="Phone" value={form.shipping_phone} onChange={(v) => update("shipping_phone", v)} required />
              <Field label="Street address" value={form.shipping_address} onChange={(v) => update("shipping_address", v)} required span={2} />
              <Field label="City" value={form.shipping_city} onChange={(v) => update("shipping_city", v)} required />
              <Field label="State" value={form.shipping_state} onChange={(v) => update("shipping_state", v)} required />
              <Field label="ZIP" value={form.shipping_zip} onChange={(v) => update("shipping_zip", v)} required />
            </Section>

            <Section title="Billing details">
              <div className="col-span-2 mb-4">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={billingSameAsShipping}
                    onChange={(e) => setBillingSameAsShipping(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500"
                  />
                  Billing address is the same as shipping
                </label>
              </div>
              <Field label="Email" type="email" value={form.billing_email} onChange={(v) => update("billing_email", v)} required span={2} />
              {!billingSameAsShipping && (
                <>
                  <Field label="Billing business name" value={form.billing_business_name} onChange={(v) => update("billing_business_name", v)} required />
                  <Field label="Billing contact name" value={form.billing_contact_name} onChange={(v) => update("billing_contact_name", v)} required />
                  <Field label="Billing phone" value={form.billing_phone} onChange={(v) => update("billing_phone", v)} required />
                  <Field label="Billing street address" value={form.billing_address} onChange={(v) => update("billing_address", v)} required span={2} />
                  <Field label="Billing city" value={form.billing_city} onChange={(v) => update("billing_city", v)} required />
                  <Field label="Billing state" value={form.billing_state} onChange={(v) => update("billing_state", v)} required />
                  <Field label="Billing ZIP" value={form.billing_zip} onChange={(v) => update("billing_zip", v)} required />
                </>
              )}
            </Section>

            <Section title="Order notes (optional)">
              <textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                className="col-span-2 rounded-lg bg-gray-900 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                rows={3}
                placeholder="Delivery instructions, PO number, etc."
              />
            </Section>

            <div className="rounded-lg bg-gray-900 border border-gray-800 p-4 space-y-3">
              <label className="flex items-start gap-3 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500 mt-0.5"
                />
                <span>
                  Send me occasional updates about new products, restock alerts, and operator tips. You can unsubscribe anytime.
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500 mt-0.5"
                  required
                />
                <span>
                  I confirm this is a business purchase for a legitimate vending operation. Wholesale pricing may unlock after signing our Coffee Supply Agreement — you&apos;ll be prompted after checkout.
                </span>
              </label>
            </div>
          </div>

          <aside className="lg:col-span-1">
            <div className="sticky top-8 rounded-lg bg-gray-900 border border-gray-800 p-6">
              <h2 className="text-lg font-semibold mb-4">Order summary</h2>
              <ul className="divide-y divide-gray-800 mb-4 max-h-80 overflow-y-auto">
                {cart.map((line) => {
                  const p = products.get(line.product_id);
                  if (!p) return null;
                  return (
                    <li key={line.product_id} className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{p.name}</p>
                          <p className="text-xs text-gray-500">SKU: {p.sku}</p>
                        </div>
                        <button type="button" onClick={() => removeLine(line.product_id)} className="text-xs text-red-400 hover:text-red-300">
                          Remove
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm">
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) => changeQty(line.product_id, Number(e.target.value))}
                          className="w-16 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-white"
                        />
                        <span className="text-white font-medium">${(p.price * line.quantity).toFixed(2)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="space-y-2 text-sm border-t border-gray-800 pt-4">
                <div className="flex justify-between text-gray-400">
                  <span>Subtotal</span>
                  <span className="text-white">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Shipping</span>
                  <span className="text-white">${shippingTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t border-gray-800 pt-2 mt-2">
                  <span>Total</span>
                  <span className="text-green-400">${total.toFixed(2)}</span>
                </div>
              </div>
              {(() => {
                const minDollars = minOrderCents / 100;
                const belowMin = minOrderEnforced && minOrderCents > 0 && subtotal < minDollars;
                if (minOrderCents > 0 && minOrderEnforced) {
                  return (
                    <div
                      className={`mt-4 rounded-lg border px-3 py-2 text-xs ${
                        belowMin
                          ? "border-yellow-500/40 bg-yellow-900/30 text-yellow-100"
                          : "border-green-500/40 bg-green-900/20 text-green-100/90"
                      }`}
                    >
                      {belowMin
                        ? `Minimum coffee order is $${minDollars.toFixed(2)}. Add $${(minDollars - subtotal).toFixed(2)} more to check out.`
                        : `Meets the $${minDollars.toFixed(2)} coffee order minimum.`}
                    </div>
                  );
                }
                return null;
              })()}
              <button
                type="submit"
                disabled={
                  submitting
                  || !acceptTerms
                  || (minOrderEnforced && minOrderCents > 0 && subtotal < minOrderCents / 100)
                }
                className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-green-500 text-black font-semibold px-6 py-3 rounded-lg hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                ) : (
                  <><CreditCard className="h-4 w-4" /> Place order</>
                )}
              </button>
              <p className="mt-3 text-xs text-gray-500 text-center">
                You&apos;ll receive an invoice by email and a link to set a password on your new account.
              </p>
            </div>
          </aside>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-900 border border-gray-800 p-6">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  span = 1,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  span?: 1 | 2;
}) {
  return (
    <label className={`text-sm ${span === 2 ? "md:col-span-2" : ""}`}>
      <span className="block text-gray-400 mb-1">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
      />
    </label>
  );
}
